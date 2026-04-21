/**
 * @module Sherpa
 * @description Sherpa Finance delta-neutral USDC yield vault on Monad.
 * Executes Sharpe-optimized strategies with USDC as the base collateral.
 *
 * **TVL:** ~$1M
 * **Type:** Delta-Neutral Yield Vault
 * **Docs:** https://sherpa.finance
 *
 * Available functions:
 * - {@link getSherpaVault} — main vault stats (TVL, exchange rate, APY)
 * - {@link getSherpaVaults} — all Sherpa vaults (currently one main vault)
 * - {@link getSherpaAPY} — annualized APY of the delta-neutral USDC vault
 * - {@link getSherpaTVL} — total USD in Sherpa vaults
 */

// ============================================================
// Rampart SDK — Sherpa Finance on Monad
// Delta-neutral USDC yield vault (Sharpe-optimized strategies).
// Source: github.com/monad-crypto/protocols/mainnet/sherpa.jsonc
// ============================================================

import { publicClient } from '../chain'

export const SHERPA_ADDRESSES = {
  SherpaVault:            '0x96043804D00DCeC238718EEDaD9ac10719778380' as `0x${string}`,
  SherpaUSD:              '0x58fC8a79055519af779308a60A7f1315cAA266Af' as `0x${string}`,
  CCIPPool:               '0xF9BC71BEDEB6ba90de4cf79f09870d99B0ba2bF0' as `0x${string}`,
  ConfigManager:          '0xFA82B15CcA7668f011171a026895dde0DefCc46b' as `0x${string}`,
  SherpaRouter:           '0xF37dD3ACbCB7B3BE161F8F67d09273D5Bc09Bd85' as `0x${string}`,
  TradingStrategyModule:  '0x35708afD736873c92134adDBD2c76689993Ab9C4' as `0x${string}`,
  SingleSigActionModule:  '0x352c308f0CB6f6B9443CBf38b89e62ca7808A61A' as `0x${string}`,
} as const

const VAULT_ABI = [
  { name: 'totalAssets',     type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'totalSupply',     type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'convertToAssets', type: 'function' as const, inputs: [{ type: 'uint256', name: 'shares' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'asset',           type: 'function' as const, inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
] as const

const ERC20_ABI = [
  { name: 'totalSupply', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'decimals',    type: 'function' as const, inputs: [], outputs: [{ type: 'uint8' }],   stateMutability: 'view' as const },
] as const

export interface SherpaVault {
  address:      string
  totalAssets:  number   // USDC units
  totalSupply:  number   // sUSD share tokens
  exchangeRate: number   // sUSD → USDC
  tvlUSD:       number
  apy:          number
  protocol:     'sherpa'
}

/**
 * Returns Sherpa Finance vault stats: total assets, exchange rate, and estimated APY.
 *
 * @returns {@link SherpaVault} with TVL in USDC, sUSD/USDC exchange rate, and hourly-extrapolated APY
 *
 * @example
 * ```typescript
 * const vault = await getSherpaVault()
 * // → { tvlUSD: 980000, exchangeRate: 1.024, apy: 0.087, protocol: 'sherpa' }
 * ```
 *
 * @category Yield
 */
export async function getSherpaVault(): Promise<SherpaVault> {
  const blockNow = await publicClient.getBlockNumber().catch(() => 0n)
  const DELTA    = 7_200n  // ~1 hour

  const [totalAssetsRaw, totalSupplyRaw, rateNow, ratePast] = await Promise.allSettled([
    publicClient.readContract({ address: SHERPA_ADDRESSES.SherpaVault, abi: VAULT_ABI, functionName: 'totalAssets' }),
    publicClient.readContract({ address: SHERPA_ADDRESSES.SherpaVault, abi: VAULT_ABI, functionName: 'totalSupply' }),
    publicClient.readContract({ address: SHERPA_ADDRESSES.SherpaVault, abi: VAULT_ABI, functionName: 'convertToAssets', args: [BigInt(1e6)] }),
    publicClient.readContract({ address: SHERPA_ADDRESSES.SherpaVault, abi: VAULT_ABI, functionName: 'convertToAssets', args: [BigInt(1e6)], blockNumber: blockNow > DELTA ? blockNow - DELTA : 1n }),
  ])

  const totalAssets = totalAssetsRaw.status === 'fulfilled' ? Number(totalAssetsRaw.value as bigint) / 1e6 : 0  // USDC 6 decimals
  const totalSupply = totalSupplyRaw.status === 'fulfilled' ? Number(totalSupplyRaw.value as bigint) / 1e6 : 0
  const r0          = rateNow.status   === 'fulfilled' ? Number(rateNow.value   as bigint) / 1e6 : 1
  const r1          = ratePast.status  === 'fulfilled' ? Number(ratePast.value  as bigint) / 1e6 : 1

  const growthPerHour = r1 > 0 ? (r0 - r1) / r1 : 0
  const apy           = Math.max(0, growthPerHour * 24 * 365)

  return {
    address:      SHERPA_ADDRESSES.SherpaVault,
    totalAssets,
    totalSupply,
    exchangeRate: r0,
    tvlUSD:       totalAssets,
    apy,
    protocol:     'sherpa',
  }
}

/**
 * Returns all Sherpa Finance vaults on Monad (currently one main USDC vault).
 *
 * @returns Array of {@link SherpaVault}
 *
 * @example
 * ```typescript
 * const vaults = await getSherpaVaults()
 * // → [{ address: '0x960...', tvlUSD: 980000, apy: 0.087, protocol: 'sherpa' }]
 * ```
 *
 * @category Yield
 */
export async function getSherpaVaults(): Promise<SherpaVault[]> {
  const vault = await getSherpaVault()
  return [vault]
}

/**
 * Returns the annualized APY of the main Sherpa delta-neutral USDC vault.
 *
 * @returns APY as a decimal (e.g. `0.087` = 8.7%)
 *
 * @example
 * ```typescript
 * const apy = await getSherpaAPY()
 * // → 0.087
 * ```
 *
 * @category Yield
 */
export async function getSherpaAPY(): Promise<number> {
  const vault = await getSherpaVault()
  return vault.apy
}

/**
 * Returns total Sherpa Finance TVL on Monad in USD.
 *
 * @returns TVL in USD (sum of all Sherpa vault `tvlUSD` values)
 *
 * @example
 * ```typescript
 * const tvl = await getSherpaTVL()
 * // → 980000
 * ```
 *
 * @category Yield
 */
export async function getSherpaTVL(): Promise<number> {
  const vault = await getSherpaVault()
  return vault.tvlUSD
}
