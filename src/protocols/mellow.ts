/**
 * @module Mellow
 * @description Mellow Protocol vault infrastructure on Monad.
 * Operates two ERC-4626 vaults: MVT (native MON) and vshMON (Fastlane shMON strategy).
 *
 * **TVL:** ~$5M
 * **Type:** Vault Infrastructure (vshMON)
 * **Docs:** https://mellow.finance
 *
 * Available functions:
 * - {@link getMellowVaults} — Mellow MVT and vshMON vaults with exchange rates
 * - {@link getMellowAPY} — annualized APY of the Mellow vshMON vault
 * - {@link getVshMONRate} — current vshMON→shMON exchange rate
 */

// ============================================================
// Rampart SDK — Mellow Protocol on Monad
// Yield vault infrastructure: MVT (MON vault) + vshMON (shMON vault)
// Source: github.com/monad-crypto/protocols/mainnet/mellow.jsonc
// ============================================================

import { publicClient } from '../chain'
import { getVerifiedPrice } from './oracles'

export const MELLOW_ADDRESSES = {
  // Core factory infrastructure
  Vault_Factory:         '0x04c0287DEdE16e0C04A1C2A52F31400a88f1dF4c' as `0x${string}`,
  Vault_Implementation:  '0x000000061Cf24abc52E54BA275579e21E96e7716' as `0x${string}`,
  // Monad Vault (MVT) — wraps native MON
  MVT:                   '0x04f8c38AE80BcF690B947f60F62BdA18145c3D67' as `0x${string}`,
  Monad_Vault:           '0x912644cdFadA93469b8aB5b4351bDCFf61691613' as `0x${string}`,
  Monad_DepositQueue_MON:'0x4b54bF09E779578a5AFD96c84b78Aa30488014B4' as `0x${string}`,
  Monad_Oracle:          '0xeb9144AbD066233e48b549b97a23ff7358BcD424' as `0x${string}`,
  // Fastlane Strategic Vault (vshMON) — wraps shMON
  vshMON:                '0x982c66D60a18F05db7D1a8987189310062d2F818' as `0x${string}`,
  Fastlane_Vault:        '0xd7441a389Df504D2124529157152AaAD766456da' as `0x${string}`,
  Fastlane_DepositQueue: '0xD25B8b6b15c19d6eFF91bd00aA17AD9c5d09a3D3' as `0x${string}`,
} as const

const ERC4626_ABI = [
  { name: 'totalAssets',     type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'totalSupply',     type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'convertToAssets', type: 'function' as const, inputs: [{ type: 'uint256', name: 'shares' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'asset',           type: 'function' as const, inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
  { name: 'name',            type: 'function' as const, inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' as const },
  { name: 'symbol',          type: 'function' as const, inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' as const },
] as const

export interface MellowVault {
  name:         string
  symbol:       string
  address:      string
  totalAssets:  number
  totalSupply:  number
  exchangeRate: number
  tvlUSD:       number
  underlying:   string    // 'MON' | 'shMON'
  protocol:     'mellow'
}

/**
 * Returns the current vshMON→shMON exchange rate from the Mellow Fastlane vault.
 *
 * @returns Exchange rate as a decimal (e.g. `1.032` means 1 vshMON redeems for 1.032 shMON)
 *
 * @example
 * ```typescript
 * const rate = await getVshMONRate()
 * // → 1.032
 * ```
 *
 * @category LST
 */
export async function getVshMONRate(): Promise<number> {
  const rate = await publicClient.readContract({
    address: MELLOW_ADDRESSES.Fastlane_Vault,
    abi: ERC4626_ABI,
    functionName: 'convertToAssets',
    args: [BigInt(1e18)],
  }).catch(() => BigInt(1e18))

  return Number(rate) / 1e18
}

/**
 * Returns stats for all Mellow vaults on Monad: MVT (native MON) and vshMON (shMON Fastlane).
 *
 * @returns Array of {@link MellowVault} with TVL in USD, exchange rates, and underlying asset
 *
 * @example
 * ```typescript
 * const vaults = await getMellowVaults()
 * // → [{ symbol: 'MVT', tvlUSD: 3200000, exchangeRate: 1.0, underlying: 'MON' }, ...]
 * ```
 *
 * @category LST
 */
export async function getMellowVaults(): Promise<MellowVault[]> {
  const vaults: Array<{ addr: `0x${string}`; underlying: string }> = [
    { addr: MELLOW_ADDRESSES.Monad_Vault,    underlying: 'MON'  },
    { addr: MELLOW_ADDRESSES.Fastlane_Vault, underlying: 'shMON' },
  ]

  const monPriceObj = await getVerifiedPrice('MON').catch(() => ({ bestPrice: 0.031 }))
  const monPrice    = monPriceObj.bestPrice

  const results = await Promise.allSettled(
    vaults.map(async ({ addr, underlying }) => {
      const [totalAssetsRaw, totalSupplyRaw, convertedRaw, name, symbol] = await Promise.allSettled([
        publicClient.readContract({ address: addr, abi: ERC4626_ABI, functionName: 'totalAssets' }),
        publicClient.readContract({ address: addr, abi: ERC4626_ABI, functionName: 'totalSupply' }),
        publicClient.readContract({ address: addr, abi: ERC4626_ABI, functionName: 'convertToAssets', args: [BigInt(1e18)] }),
        publicClient.readContract({ address: addr, abi: ERC4626_ABI, functionName: 'name' }),
        publicClient.readContract({ address: addr, abi: ERC4626_ABI, functionName: 'symbol' }),
      ])

      const totalAssets  = totalAssetsRaw.status  === 'fulfilled' ? Number(totalAssetsRaw.value as bigint)  / 1e18 : 0
      const totalSupply  = totalSupplyRaw.status  === 'fulfilled' ? Number(totalSupplyRaw.value as bigint)  / 1e18 : 0
      const exchangeRate = convertedRaw.status    === 'fulfilled' ? Number(convertedRaw.value as bigint)    / 1e18 : 1
      const nameVal      = name.status            === 'fulfilled' ? (name.value as string)   : underlying
      const symbolVal    = symbol.status          === 'fulfilled' ? (symbol.value as string) : underlying

      return {
        name:         nameVal,
        symbol:       symbolVal,
        address:      addr,
        totalAssets,
        totalSupply,
        exchangeRate,
        tvlUSD:       totalAssets * monPrice,
        underlying,
        protocol:     'mellow' as const,
      } satisfies MellowVault
    })
  )

  return results.flatMap(r => r.status === 'fulfilled' ? [r.value as MellowVault] : [])
}

/**
 * Returns the estimated annualized APY of the Mellow vshMON vault.
 *
 * @returns APY as a decimal computed from vshMON/shMON exchange rate delta over ~1 hour of blocks
 *
 * @example
 * ```typescript
 * const apy = await getMellowAPY()
 * // → 0.062
 * ```
 *
 * @category LST
 */
export async function getMellowAPY(): Promise<number> {
  // The Mellow vault earns on top of shMON — probe two historical exchange rates
  const blockNow = await publicClient.getBlockNumber().catch(() => 0n)
  if (blockNow === 0n) return 0

  const DELTA = 7_200n  // ~1 hour at 500ms blocks

  const [rateNow, ratePast] = await Promise.allSettled([
    publicClient.readContract({ address: MELLOW_ADDRESSES.Fastlane_Vault, abi: ERC4626_ABI, functionName: 'convertToAssets', args: [BigInt(1e18)] }),
    publicClient.readContract({ address: MELLOW_ADDRESSES.Fastlane_Vault, abi: ERC4626_ABI, functionName: 'convertToAssets', args: [BigInt(1e18)], blockNumber: blockNow > DELTA ? blockNow - DELTA : 1n }),
  ])

  if (rateNow.status !== 'fulfilled' || ratePast.status !== 'fulfilled') return 0

  const r0  = Number(rateNow.value as bigint)  / 1e18
  const r1  = Number(ratePast.value as bigint) / 1e18
  if (r1 === 0) return 0

  const growthPerHour     = (r0 - r1) / r1
  const annualizedGrowth  = growthPerHour * 24 * 365
  return Math.max(0, annualizedGrowth)
}

export { MELLOW_ADDRESSES as MELLOW }
