/**
 * @module Euler
 * @description Euler V2 isolated lending vaults on Monad — 108 vaults, each with independent risk parameters.
 *
 * **TVL:** ~$15M
 * **Type:** Lending (Euler V2)
 * **Docs:** https://docs.euler.finance
 *
 * Available functions:
 * - {@link getEulerVaults} — all Euler V2 vaults with APR and TVL
 * - {@link getEulerBestSupply} — vault with highest supply APY
 * - {@link getEulerTVL} — total USD across all Euler vaults
 */

// ============================================================
// Rampart SDK — Euler Finance V2 (Phase 11)
// Factory: 0xba4dd672062de8feedb665dd4410658864483f1e
// 108 vaults on Monad mainnet
// APR: interestRate() / 1e27 * SECONDS_PER_YEAR
// ============================================================

import { publicClient } from '../chain'

const EULER_FACTORY: `0x${string}` = '0xba4dd672062de8feedb665dd4410658864483f1e'
const SECONDS_PER_YEAR = 31_536_000

const FACTORY_ABI = [
  { name: 'getProxyListLength', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'getProxyListSlice',  type: 'function' as const, inputs: [{ type: 'uint256' }, { type: 'uint256' }], outputs: [{ type: 'address[]' }], stateMutability: 'view' as const },
] as const

const VAULT_ABI = [
  { name: 'asset',        type: 'function' as const, inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
  { name: 'symbol',       type: 'function' as const, inputs: [], outputs: [{ type: 'string' }],  stateMutability: 'view' as const },
  { name: 'totalAssets',  type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'totalBorrows', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'interestRate', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'interestFee',  type: 'function' as const, inputs: [], outputs: [{ type: 'uint16' }],  stateMutability: 'view' as const },
  { name: 'LTVFull',      type: 'function' as const, inputs: [{ name: 'collateral', type: 'address' }, { name: 'vault', type: 'address' }], outputs: [{ type: 'uint16' }], stateMutability: 'view' as const },
] as const

const ERC20_ABI = [
  { name: 'symbol',   type: 'function' as const, inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' as const },
  { name: 'decimals', type: 'function' as const, inputs: [], outputs: [{ type: 'uint8' }],  stateMutability: 'view' as const },
] as const

export interface EulerVault {
  address:         string
  vaultSymbol:     string
  assetSymbol:     string
  assetAddress:    string
  totalAssets:     number   // in asset units
  totalBorrows:    number
  utilizationRate: number   // 0..1
  borrowAPR:       number   // e.g. 0.049 = 4.9%
  supplyAPY:       number   // borrowAPR * utilization
  reserveFactor:   number   // protocol fee on interest (0..1)
  ltv:             number   // loan-to-value / collateral factor (0..1)
  protocol:        'euler'
}

function calcAPR(interestRateRaw: bigint): number {
  // Euler V2: interestRate is per-second rate scaled by 1e27
  // APR = rate/1e27 * SECONDS_PER_YEAR
  return (Number(interestRateRaw) / 1e27) * SECONDS_PER_YEAR
}

/**
 * Returns all active Euler V2 vaults with APR and TVL data.
 *
 * Fetches the vault list from the factory's proxy registry, then queries each vault
 * for its underlying asset, symbol, `totalAssets`, `totalBorrows`, and `interestRate`.
 * Empty vaults (`totalAssets === 0`) are skipped. Results are sorted by TVL descending.
 * APR is derived as `interestRate / 1e27 * SECONDS_PER_YEAR`.
 *
 * @param maxVaults - Maximum number of vaults to scan (default `108`)
 * @returns Array of {@link EulerVault} objects sorted by `totalAssets` descending
 *
 * @example
 * ```typescript
 * const vaults = await getEulerVaults(20)
 * // → [{ vaultSymbol: 'eUSDC-1', assetSymbol: 'USDC', totalAssets: 5000000, borrowAPR: 0.049, supplyAPY: 0.031, ... }, ...]
 * ```
 *
 * @category Lending
 */
export async function getEulerVaults(maxVaults = 108): Promise<EulerVault[]> {
  const len = await publicClient.readContract({
    address: EULER_FACTORY, abi: FACTORY_ABI, functionName: 'getProxyListLength',
  })
  const limit = len < BigInt(maxVaults) ? len : BigInt(maxVaults)
  const addresses = await publicClient.readContract({
    address: EULER_FACTORY, abi: FACTORY_ABI, functionName: 'getProxyListSlice',
    args: [0n, limit],
  })

  const results = await Promise.allSettled(
    addresses.map(async (vault) => {
      const [vaultSym, assetAddr] = await Promise.all([
        publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'symbol' }),
        publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'asset' }),
      ])
      const [assetSym, assetDec, totalAssets, totalBorrows, interestRate, interestFeeRaw, ltvRaw] = await Promise.all([
        publicClient.readContract({ address: assetAddr, abi: ERC20_ABI, functionName: 'symbol' }),
        publicClient.readContract({ address: assetAddr, abi: ERC20_ABI, functionName: 'decimals' }),
        publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'totalAssets' }),
        publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'totalBorrows' }),
        publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'interestRate' }).catch(() => 0n),
        publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'interestFee' }).catch(() => null),
        publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'LTVFull', args: [vault, vault] }).catch(() => null),
      ])
      const dec     = Number(assetDec)
      const divisor = 10n ** BigInt(dec)
      const ta      = Number((totalAssets  as bigint) / divisor)
      const tb      = Number((totalBorrows as bigint) / divisor)
      if (ta === 0) return null  // skip empty vaults
      const util         = ta > 0 ? tb / ta : 0
      const borrowAPR    = calcAPR(interestRate as bigint)
      const reserveFactor = interestFeeRaw !== null ? Number(interestFeeRaw) / 10000 : 0
      const ltv           = ltvRaw !== null          ? Number(ltvRaw)         / 10000 : 0
      return {
        address:         vault,
        vaultSymbol:     vaultSym as string,
        assetSymbol:     assetSym as string,
        assetAddress:    assetAddr,
        totalAssets:     ta,
        totalBorrows:    tb,
        utilizationRate: util,
        borrowAPR,
        supplyAPY:       borrowAPR * util,
        reserveFactor,
        ltv,
        protocol:        'euler' as const,
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
 * Supply APY is calculated as `borrowAPR * utilizationRate` — the fraction of
 * interest paid by borrowers that flows to depositors. Calls {@link getEulerVaults}
 * internally and sorts by `supplyAPY` descending.
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
 * Filters to stablecoin vaults only (USDC, AUSD, USDT0) where `totalAssets ≈ USD face value`,
 * then sums their balances. Volatile assets (WMON, WBTC, WETH) are excluded to avoid
 * unpriced exposure until a price oracle integration is added.
 *
 * @returns Total stablecoin TVL in USD (approximate)
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
  // Rough USD: stable assets ≈ face value, WMON/WBTC/WETH are marked at raw units
  return vaults
    .filter(v => ['USDC', 'AUSD', 'USDT0'].includes(v.assetSymbol))
    .reduce((s, v) => s + v.totalAssets, 0)
}
