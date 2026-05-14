/**
 * @module Euler
 * @description Euler V2 isolated lending vaults on Monad — dynamic vault count, each with independent risk parameters.
 *
 * **TVL:** ~$15M
 * **Type:** Lending (Euler V2)
 * **Docs:** https://docs.euler.finance
 *
 * Available functions:
 * - {@link getEulerVaults} — all Euler V2 vaults with APR, TVL, cash, IRM address, and best LTV
 * - {@link getEulerBestSupply} — vault with highest supply APY
 * - {@link getEulerTVL} — total USD across all Euler vaults
 */

// ============================================================
// Rampart SDK — Euler Finance V2 (Phase 11)
// Factory: 0xba4dd672062de8feedb665dd4410658864483f1e
// APR: interestRate() / 1e27 * SECONDS_PER_YEAR
// ============================================================

import { publicClient } from '../chain'
import { getVerifiedPrice } from './oracles'

const EULER_FACTORY: `0x${string}` = '0xba4dd672062de8feedb665dd4410658864483f1e'
const SECONDS_PER_YEAR = 31_536_000

const FACTORY_ABI = [
  { name: 'getProxyListLength', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'getProxyListSlice',  type: 'function' as const, inputs: [{ type: 'uint256' }, { type: 'uint256' }], outputs: [{ type: 'address[]' }], stateMutability: 'view' as const },
] as const

const VAULT_ABI = [
  { name: 'asset',              type: 'function' as const, inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
  { name: 'symbol',             type: 'function' as const, inputs: [], outputs: [{ type: 'string' }],  stateMutability: 'view' as const },
  { name: 'totalAssets',        type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'totalBorrows',       type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'cash',               type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'interestRate',       type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'interestFee',        type: 'function' as const, inputs: [], outputs: [{ type: 'uint16' }],  stateMutability: 'view' as const },
  { name: 'interestRateModel',  type: 'function' as const, inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
  { name: 'LTVFull',            type: 'function' as const, inputs: [{ name: 'collateral', type: 'address' }, { name: 'vault', type: 'address' }], outputs: [{ type: 'uint16' }], stateMutability: 'view' as const },
  { name: 'LTVList',            type: 'function' as const, inputs: [], outputs: [{ type: 'address[]' }], stateMutability: 'view' as const },
] as const

const ERC20_ABI = [
  { name: 'symbol',   type: 'function' as const, inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' as const },
  { name: 'decimals', type: 'function' as const, inputs: [], outputs: [{ type: 'uint8' }],  stateMutability: 'view' as const },
] as const

export interface EulerVault {
  address:            string
  vaultSymbol:        string
  assetSymbol:        string
  assetAddress:       string
  totalAssets:        number
  totalBorrows:       number
  cash:               number
  utilizationRate:    number
  borrowAPR:          number
  supplyAPY:          number
  reserveFactor:      number
  ltv:                number
  interestRateModel:  string
  protocol:           'euler'
}

function calcAPR(interestRateRaw: bigint): number {
  return (Number(interestRateRaw) / 1e27) * SECONDS_PER_YEAR
}

async function getBestLTV(vault: `0x${string}`): Promise<number> {
  try {
    const collaterals = await publicClient.readContract({
      address: vault, abi: VAULT_ABI, functionName: 'LTVList',
    }) as `0x${string}`[]
    if (collaterals.length === 0) return 0
    const ltvs = await Promise.allSettled(
      collaterals.map(collateral =>
        publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'LTVFull', args: [collateral, vault] })
      )
    )
    const values = ltvs
      .filter((r): r is PromiseFulfilledResult<number> => r.status === 'fulfilled')
      .map(r => Number(r.value))
    return values.length > 0 ? Math.max(...values) / 10000 : 0
  } catch {
    return 0
  }
}

/**
 * Returns all active Euler V2 vaults with APR, TVL, cash, IRM address, and best LTV.
 *
 * Vault count is fetched dynamically from the factory via `getProxyListLength()`.
 * LTV is resolved by calling `LTVList()` per vault to get recognized collaterals,
 * then `LTVFull(collateral, vault)` for each — the highest value is reported.
 * Empty vaults (`totalAssets === 0`) are skipped.
 *
 * @param maxVaults - Cap on vault count (default 200, actual count read from factory)
 * @returns Array of {@link EulerVault} objects sorted by `totalAssets` descending
 *
 * @example
 * ```typescript
 * const vaults = await getEulerVaults()
 * // → [{ vaultSymbol: 'eUSDC-1', assetSymbol: 'USDC', totalAssets: 5000000, ltv: 0.86, cash: 2000000, ... }]
 * ```
 *
 * @category Lending
 */
export async function getEulerVaults(maxVaults = 200): Promise<EulerVault[]> {
  const len = await publicClient.readContract({
    address: EULER_FACTORY, abi: FACTORY_ABI, functionName: 'getProxyListLength',
  })
  const limit = len < BigInt(maxVaults) ? len : BigInt(maxVaults)
  const addresses = await publicClient.readContract({
    address: EULER_FACTORY, abi: FACTORY_ABI, functionName: 'getProxyListSlice',
    args: [0n, limit],
  })

  const results = await Promise.allSettled(
    (addresses as `0x${string}`[]).map(async (vault) => {
      const [vaultSym, assetAddr] = await Promise.all([
        publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'symbol' }),
        publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'asset' }),
      ])
      const [
        assetSym, assetDec, totalAssets, totalBorrows, cashRaw,
        interestRate, interestFeeRaw, irmAddr,
      ] = await Promise.all([
        publicClient.readContract({ address: assetAddr as `0x${string}`, abi: ERC20_ABI, functionName: 'symbol' }),
        publicClient.readContract({ address: assetAddr as `0x${string}`, abi: ERC20_ABI, functionName: 'decimals' }),
        publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'totalAssets' }),
        publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'totalBorrows' }),
        publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'cash' }).catch(() => 0n),
        publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'interestRate' }).catch(() => 0n),
        publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'interestFee' }).catch(() => null),
        publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'interestRateModel' }).catch(() => null),
      ])
      const dec      = Number(assetDec)
      const divisor  = 10n ** BigInt(dec)
      const ta       = Number((totalAssets  as bigint) / divisor)
      const tb       = Number((totalBorrows as bigint) / divisor)
      if (ta === 0) return null
      const cashVal       = Number((cashRaw as bigint) / divisor)
      const util          = ta > 0 ? tb / ta : 0
      const borrowAPR     = calcAPR(interestRate as bigint)
      const reserveFactor = interestFeeRaw !== null ? Number(interestFeeRaw) / 10000 : 0
      const ltv           = await getBestLTV(vault)
      return {
        address:           vault,
        vaultSymbol:       vaultSym as string,
        assetSymbol:       assetSym as string,
        assetAddress:      assetAddr as string,
        totalAssets:       ta,
        totalBorrows:      tb,
        cash:              cashVal,
        utilizationRate:   util,
        borrowAPR,
        supplyAPY:         borrowAPR * util * (1 - reserveFactor),
        reserveFactor,
        ltv,
        interestRateModel: irmAddr as string ?? '',
        protocol:          'euler' as const,
      }
    }),
  )

  return results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => (r as PromiseFulfilledResult<EulerVault>).value)
    .sort((a, b) => b.totalAssets - a.totalAssets)
}

/**
 * Returns the Euler V2 vault with the highest current supply APY.
 *
 * @returns The {@link EulerVault} with the maximum `supplyAPY`
 *
 * @example
 * ```typescript
 * const vault = await getEulerBestSupply()
 * // → { vaultSymbol: 'eUSDC-1', supplyAPY: 0.061, borrowAPR: 0.085, utilizationRate: 0.72, ... }
 * ```
 *
 * @category Lending
 */
export async function getEulerBestSupply(): Promise<EulerVault> {
  const vaults = await getEulerVaults()
  return vaults.sort((a, b) => b.supplyAPY - a.supplyAPY)[0]
}

/**
 * Returns the total USD-equivalent TVL across all Euler vaults.
 *
 * Stablecoin vaults use face value. Non-stablecoin vaults use `getVerifiedPrice()`
 * to get oracle-validated USD price before multiplying by `totalAssets`.
 *
 * @returns Total TVL in USD across all vaults
 *
 * @example
 * ```typescript
 * const tvl = await getEulerTVL()
 * // → 14800000
 * ```
 *
 * @category Lending
 */
export async function getEulerTVL(): Promise<number> {
  const vaults = await getEulerVaults()
  const STABLECOINS = new Set(['USDC', 'AUSD', 'USDT0', 'USDT', 'DAI'])

  const usdValues = await Promise.allSettled(
    vaults.map(async (v) => {
      if (STABLECOINS.has(v.assetSymbol)) return v.totalAssets
      try {
        const verified = await getVerifiedPrice(v.assetSymbol)
        return v.totalAssets * verified.bestPrice
      } catch {
        return 0
      }
    })
  )

  return usdValues
    .filter((r): r is PromiseFulfilledResult<number> => r.status === 'fulfilled')
    .reduce((s, r) => s + r.value, 0)
}
