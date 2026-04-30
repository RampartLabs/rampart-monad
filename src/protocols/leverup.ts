/**
 * @module LeverUp
 * @description LeverUp leveraged derivatives protocol on Monad.
 * Issues LVUSD (delta-neutral stablecoin) and LVMON (leveraged MON exposure token).
 *
 * **TVL:** ~$2M
 * **Type:** Leveraged Perps + LVUSD
 * **Docs:** https://leverup.io
 *
 * Available functions:
 * - {@link getLeverUpStats} — LVUSD supply, LVMON supply, collateral ratio
 * - {@link getLeverUpMarkets} — LeverUp leveraged markets as PerpMarket structs
 */

// ============================================================
// Rampart SDK — LeverUp on Monad
// Leveraged derivatives protocol with LVUSD stablecoin and LVMON token.
// Source: github.com/monad-crypto/protocols/mainnet/leverup.jsonc
// ============================================================

import { publicClient } from '../chain'
import { getVerifiedPrice } from './oracles'

export const LEVERUP_ADDRESSES = {
  LeverUp:      '0xea1b8E4aB7f14F7dCA68c5B214303B13078FC5ec' as `0x${string}`,
  LVUSD:        '0xFD44B35139Ae53FFF7d8F2A9869c503D987f00d1' as `0x${string}`,
  LVMON:        '0x91b81bfbe3A747230F0529Aa28d8b2Bc898E6D56' as `0x${string}`,
  LVUSD_Issuer: '0x135951057cfcccA7E8ef87ee41318D670f723F68' as `0x${string}`,
  LVMON_Issuer: '0xbF52cED429C3901AfA4BBF25849269eF7A4ad105' as `0x${string}`,
  LV:           '0x1001fF13bf368Aa4fa85F21043648079F00E1001' as `0x${string}`,
} as const

const ERC20_ABI = [
  { name: 'totalSupply', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'decimals',    type: 'function' as const, inputs: [], outputs: [{ type: 'uint8' }],   stateMutability: 'view' as const },
  { name: 'symbol',      type: 'function' as const, inputs: [], outputs: [{ type: 'string' }],  stateMutability: 'view' as const },
] as const

const LEVERUP_MAIN_ABI = [
  { name: 'totalOpenInterest',  type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'totalLongPositions', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'totalShortPositions',type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'collateralBalance',  type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'totalCollateral',    type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'maxLeverage',        type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
] as const

export interface LeverUpStats {
  tvlUSD:                 number    // collateral locked
  longOI:                 number    // long open interest (USD)
  shortOI:                number    // short open interest (USD)
  totalOI:                number
  lvusdSupply:            number    // LVUSD tokens in circulation
  lvmonSupply:            number    // LVMON tokens in circulation
  collateralizationRatio: number    // tvlUSD / lvusdSupply — collateral coverage of LVUSD
  lvusdBacking:           number    // MON-denominated collateral backing LVUSD
  protocol:               'leverup'
}

/**
 * Returns LeverUp protocol stats: collateral TVL, open interest, and LVUSD/LVMON token supplies.
 *
 * @returns {@link LeverUpStats} — TVL in USD, long/short OI in USD, LVUSD and LVMON circulating supply
 *
 * @example
 * ```typescript
 * const stats = await getLeverUpStats()
 * // → { tvlUSD: 2100000, lvusdSupply: 900000, lvmonSupply: 420000, longOI: 600000, ... }
 * ```
 *
 * @category Perps
 */
export async function getLeverUpStats(): Promise<LeverUpStats> {
  const [collateralRaw, longOIRaw, shortOIRaw, lvusdSupplyRaw, lvmonSupplyRaw] = await Promise.allSettled([
    publicClient.readContract({ address: LEVERUP_ADDRESSES.LeverUp, abi: LEVERUP_MAIN_ABI, functionName: 'totalCollateral' }).catch(() =>
      publicClient.readContract({ address: LEVERUP_ADDRESSES.LeverUp, abi: LEVERUP_MAIN_ABI, functionName: 'collateralBalance' })
    ),
    publicClient.readContract({ address: LEVERUP_ADDRESSES.LeverUp, abi: LEVERUP_MAIN_ABI, functionName: 'totalLongPositions' }),
    publicClient.readContract({ address: LEVERUP_ADDRESSES.LeverUp, abi: LEVERUP_MAIN_ABI, functionName: 'totalShortPositions' }),
    publicClient.readContract({ address: LEVERUP_ADDRESSES.LVUSD, abi: ERC20_ABI, functionName: 'totalSupply' }),
    publicClient.readContract({ address: LEVERUP_ADDRESSES.LVMON, abi: ERC20_ABI, functionName: 'totalSupply' }),
  ])

  const monPrice = await getVerifiedPrice('MON').then(r => r.bestPrice)

  // Collateral is likely in MON or LVUSD — convert to USD
  const collateral = collateralRaw.status  === 'fulfilled' ? Number(collateralRaw.value  as bigint) / 1e18 : 0
  const longOI     = longOIRaw.status     === 'fulfilled' ? Number(longOIRaw.value     as bigint) / 1e18 : 0
  const shortOI    = shortOIRaw.status    === 'fulfilled' ? Number(shortOIRaw.value    as bigint) / 1e18 : 0
  const lvusdSupply = lvusdSupplyRaw.status === 'fulfilled' ? Number(lvusdSupplyRaw.value as bigint) / 1e18 : 0
  const lvmonSupply = lvmonSupplyRaw.status === 'fulfilled' ? Number(lvmonSupplyRaw.value as bigint) / 1e18 : 0

  // TVL = LVUSD supply (1:1 USD) + LVMON supply * MON price
  const tvlUSD = lvusdSupply + lvmonSupply * monPrice + collateral

  const collateralizationRatio = lvusdSupply > 0 ? tvlUSD / lvusdSupply : 0
  const lvusdBacking = lvmonSupply * monPrice + collateral

  return {
    tvlUSD:                 Math.max(tvlUSD, lvusdSupply),   // LVUSD supply is min TVL
    longOI:                 longOI * monPrice,
    shortOI:                shortOI * monPrice,
    totalOI:                (longOI + shortOI) * monPrice,
    lvusdSupply,
    lvmonSupply,
    collateralizationRatio,
    lvusdBacking,
    protocol:               'leverup',
  }
}

/**
 * Returns LeverUp leveraged markets as PerpMarket-compatible structs for cross-protocol aggregation.
 *
 * @returns Array with a single MON-denominated market entry shaped as a {@link PerpMarket}
 *
 * @example
 * ```typescript
 * const markets = await getLeverUpMarkets()
 * // → [{ protocol: 'leverup', asset: 'MON', longOI: 600000, maxLeverage: 10, sentiment: 'neutral' }]
 * ```
 *
 * @category Perps
 */
export async function getLeverUpMarkets() {
  const stats = await getLeverUpStats()
  return [{
    protocol:      'leverup' as const,
    asset:         'MON',
    longOI:        stats.longOI,
    shortOI:       stats.shortOI,
    totalOI:       stats.totalOI,
    fundingRate:   0,
    longFundingAPR: 0,
    maxLeverage:   10,
    sentiment:     stats.longOI > stats.shortOI * 1.1
      ? 'bullish' as const
      : stats.shortOI > stats.longOI * 1.1
        ? 'bearish' as const
        : 'neutral' as const,
  }]
}
