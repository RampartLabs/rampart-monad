/**
 * @module Perps
 * @description Perpetuals protocols on Monad: Monday Trade and Perpl Exchange.
 * Provides open interest, funding rates, vault TVL, and cross-protocol aggregation.
 *
 * **TVL:** ~$3M
 * **Type:** Perpetuals
 * **Docs:** https://app.perpl.xyz
 *
 * Available functions:
 * - {@link getMondayMarkets} — Monday Markets perp markets
 * - {@link getPerplMarkets} — Perpl perpetual markets with funding rates
 * - {@link getPerplTVL} — total USD in Perpl vaults
 * - {@link getPerpVaultStats} — vault utilization and TVL for all perp protocols
 * - {@link getFundingRates} — current funding rates across perp protocols
 * - {@link getTotalPerpTVL} — combined TVL across all perp protocols on Monad
 */

// ============================================================
// Rampart SDK — Perpetuals (Phase 15b)
// Monday Trade (Uniswap V3 fork DEX) + Perpl Exchange
// ============================================================

import { publicClient } from '../chain'

// ── Monday Trade (Uniswap V3 fork) ───────────────────────────
// Monday Trade is a spot DEX (not a traditional perp with funding rates)
// Uses Uniswap V3 factory / router / quoter architecture on Monad
const MONDAY_FACTORY:     `0x${string}` = '0xC1e98D0A2a58fB8aBd10ccc30a58efff4080Aa21'
const MONDAY_SWAP_ROUTER: `0x${string}` = '0xFE951b693A2FE54BE5148614B109E316B567632F'
const MONDAY_QUOTER_V2:   `0x${string}` = '0xB97eCD41Aef0F842E773C8F9905919cDE49880C9'

// ── Perpl Exchange ────────────────────────────────────────────
// Monad-native perpetuals exchange
// Collateral: AUSD (0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a)
const PERPL_EXCHANGE:     `0x${string}` = '0x34B6552d57a35a1D042CcAe1951BD1C370112a6F'
const PERPL_AUSD:         `0x${string}` = '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a'

const PERP_VAULT_ABI = [
  { name: 'totalAssets',       type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'totalOpenInterest', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'fundingRate',       type: 'function' as const, inputs: [{ type: 'address' }], outputs: [{ type: 'int256' }], stateMutability: 'view' as const },
] as const

const PERP_READER_ABI = [
  { name: 'getMarkets',    type: 'function' as const, inputs: [], outputs: [{ type: 'address[]' }], stateMutability: 'view' as const },
  { name: 'getMarketInfo', type: 'function' as const,
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'tuple', components: [
      { name: 'longOI',      type: 'uint256' },
      { name: 'shortOI',     type: 'uint256' },
      { name: 'fundingRate', type: 'int256'  },
      { name: 'maxLeverage', type: 'uint256' },
    ]}],
    stateMutability: 'view' as const,
  },
] as const

const PERPL_ABI = [
  { name: 'totalLiquidity',    type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'openInterest',      type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'longOpenInterest',  type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'shortOpenInterest', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'fundingRate',       type: 'function' as const, inputs: [], outputs: [{ type: 'int256' }], stateMutability: 'view' as const },
] as const

const ERC20_ABI = [
  { name: 'totalSupply', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'balanceOf',   type: 'function' as const, inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
] as const

export interface PerpMarket {
  protocol:       'monday' | 'perpl'
  asset:          string
  longOI:         number
  shortOI:        number
  totalOI:        number
  fundingRate:    number    // per hour
  longFundingAPR: number
  maxLeverage:    number
  sentiment:      'bullish' | 'bearish' | 'neutral'
}

export interface PerpVaultStats {
  protocol:        'monday' | 'perpl'
  tvl:             number
  totalOI:         number
  utilizationRate: number
}

async function getProtocolVaultStats(
  protocol: 'monday' | 'perpl',
  vaultAddr: `0x${string}`
): Promise<PerpVaultStats | null> {
  if (vaultAddr === '0x0000000000000000000000000000000000000000') return null
  try {
    const [assets, oi] = await Promise.all([
      publicClient.readContract({ address: vaultAddr, abi: PERP_VAULT_ABI, functionName: 'totalAssets' }).catch(() => 0n),
      publicClient.readContract({ address: vaultAddr, abi: PERP_VAULT_ABI, functionName: 'totalOpenInterest' }).catch(() => 0n),
    ])
    const tvl     = Number(assets as bigint) / 1e6
    const totalOI = Number(oi as bigint) / 1e6
    return { protocol, tvl, totalOI, utilizationRate: tvl > 0 ? totalOI / tvl : 0 }
  } catch {
    return null
  }
}

/**
 * Returns perpetual market stats from Monday Trade (Uniswap V3 fork on Monad).
 *
 * @returns Array of {@link PerpMarket} — empty until perp-specific ABI is confirmed on-chain
 *
 * @example
 * ```typescript
 * const markets = await getMondayMarkets()
 * // → [{ protocol: 'monday', asset: '0x...', longOI: 120000, fundingRate: 0.00003, ... }]
 * ```
 *
 * @category Perps
 */
export async function getMondayMarkets(): Promise<PerpMarket[]> {
  try {
    const markets = await publicClient.readContract({
      address: MONDAY_FACTORY, abi: PERP_READER_ABI, functionName: 'getMarkets',
    }) as `0x${string}`[]

    const results = await Promise.allSettled(
      markets.map(async (market) => {
        const info = await publicClient.readContract({
          address: MONDAY_FACTORY, abi: PERP_READER_ABI, functionName: 'getMarketInfo', args: [market],
        }) as { longOI: bigint; shortOI: bigint; fundingRate: bigint; maxLeverage: bigint }
        const longOI      = Number(info.longOI)  / 1e6
        const shortOI     = Number(info.shortOI) / 1e6
        const fundingRate = Number(info.fundingRate) / 1e18
        return {
          protocol:       'monday' as const,
          asset:          market,
          longOI,
          shortOI,
          totalOI:        longOI + shortOI,
          fundingRate,
          longFundingAPR: fundingRate * 24 * 365,
          maxLeverage:    Number(info.maxLeverage),
          sentiment:      longOI > shortOI * 1.1 ? 'bullish' as const : shortOI > longOI * 1.1 ? 'bearish' as const : 'neutral' as const,
        }
      }),
    )
    return results
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<PerpMarket>).value)
  } catch {
    return []
  }
}

/**
 * Returns Perpl Exchange perpetual markets with open interest and funding rates.
 *
 * @returns Array of {@link PerpMarket} for MON-denominated perpetual positions on Perpl
 *
 * @example
 * ```typescript
 * const markets = await getPerplMarkets()
 * // → [{ protocol: 'perpl', asset: 'MON', longOI: 80000, fundingRate: 0.00002, sentiment: 'bullish' }]
 * ```
 *
 * @category Perps
 */
export async function getPerplMarkets(): Promise<PerpMarket[]> {
  try {
    const [longOIRaw, shortOIRaw, fundingRaw] = await Promise.all([
      publicClient.readContract({ address: PERPL_EXCHANGE, abi: PERPL_ABI, functionName: 'longOpenInterest' }).catch(() => null),
      publicClient.readContract({ address: PERPL_EXCHANGE, abi: PERPL_ABI, functionName: 'shortOpenInterest' }).catch(() => null),
      publicClient.readContract({ address: PERPL_EXCHANGE, abi: PERPL_ABI, functionName: 'fundingRate' }).catch(() => 0n),
    ])
    if (longOIRaw === null && shortOIRaw === null) return []

    const longOI      = longOIRaw  !== null ? Number(longOIRaw  as bigint) / 1e18 : 0
    const shortOI     = shortOIRaw !== null ? Number(shortOIRaw as bigint) / 1e18 : 0
    const fundingRate = Number(fundingRaw as bigint) / 1e18

    return [{
      protocol:       'perpl',
      asset:          'MON',
      longOI,
      shortOI,
      totalOI:        longOI + shortOI,
      fundingRate,
      longFundingAPR: fundingRate * 24 * 365,
      maxLeverage:    20,
      sentiment:      longOI > shortOI * 1.1 ? 'bullish' : shortOI > longOI * 1.1 ? 'bearish' : 'neutral',
    }]
  } catch {
    return []
  }
}

/**
 * Returns total USD locked in the Perpl Exchange via AUSD collateral balance.
 *
 * @returns TVL in USD (AUSD is 18 decimals, treated 1:1 with USD)
 *
 * @example
 * ```typescript
 * const tvl = await getPerplTVL()
 * // → 2400000
 * ```
 *
 * @category Perps
 */
export async function getPerplTVL(): Promise<number> {
  try {
    const balance = await publicClient.readContract({
      address: PERPL_AUSD, abi: ERC20_ABI, functionName: 'balanceOf', args: [PERPL_EXCHANGE],
    })
    return Number(balance as bigint) / 1e18   // AUSD is 18 decimals
  } catch {
    return 0
  }
}

/**
 * Returns vault utilization and TVL stats for all perpetual protocols on Monad.
 *
 * @returns Array of {@link PerpVaultStats} for Monday, Perpl, and Narwhal
 *
 * @example
 * ```typescript
 * const stats = await getPerpVaultStats()
 * // → [{ protocol: 'perpl', tvl: 2400000, totalOI: 1800000, utilizationRate: 0.75 }]
 * ```
 *
 * @category Perps
 */
export async function getPerpVaultStats(): Promise<PerpVaultStats[]> {
  const [monday, perplTvl] = await Promise.all([
    getProtocolVaultStats('monday', MONDAY_FACTORY),
    getPerplTVL(),
  ])
  const perplStats: PerpVaultStats = { protocol: 'perpl', tvl: perplTvl, totalOI: 0, utilizationRate: 0 }
  return [monday, perplStats].filter((s): s is PerpVaultStats => s !== null)
}

/**
 * Returns current funding rates across all perpetual protocols on Monad.
 *
 * @returns Array of objects with `protocol`, `asset`, `rate` (per hour), and `apr` (annualized)
 *
 * @example
 * ```typescript
 * const rates = await getFundingRates()
 * // → [{ protocol: 'perpl', asset: 'MON', rate: 0.00002, apr: 0.175 }]
 * ```
 *
 * @category Perps
 */
export async function getFundingRates(): Promise<{
  protocol: string
  asset:    string
  rate:     number
  apr:      number
}[]> {
  const [monday, perpl] = await Promise.all([getMondayMarkets(), getPerplMarkets()])
  return [...monday, ...perpl].map(m => ({
    protocol: m.protocol,
    asset:    m.asset,
    rate:     m.fundingRate,
    apr:      m.longFundingAPR,
  }))
}

/**
 * Returns combined TVL in USD across all perpetual protocols on Monad (Monday + Perpl + Narwhal).
 *
 * @returns Total TVL in USD
 *
 * @example
 * ```typescript
 * const tvl = await getTotalPerpTVL()
 * // → 5100000
 * ```
 *
 * @category Perps
 */
export async function getTotalPerpTVL(): Promise<number> {
  const stats = await getPerpVaultStats()
  return stats.reduce((s, v) => s + v.tvl, 0)
}

export { MONDAY_FACTORY, MONDAY_SWAP_ROUTER, MONDAY_QUOTER_V2, PERPL_EXCHANGE }
