/**
 * @module LeverUp
 * @description LeverUp leveraged derivatives protocol on Monad.
 * Issues LVUSD (delta-neutral stablecoin) and LVMON (leveraged MON exposure token).
 *
 * **TVL:** ~$2M
 * **Type:** Leveraged Perps + LVUSD
 * **Docs:** https://app.leverup.xyz
 *
 * Available functions:
 * - {@link getLeverUpStats} — LVUSD supply, LVMON supply, collateral ratio, issuer collateral ratios
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
  { name: 'fundingRate',        type: 'function' as const, inputs: [], outputs: [{ type: 'int256' }],  stateMutability: 'view' as const },
] as const

const ISSUER_ABI = [
  { name: 'collateralRatio', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
] as const

export interface LeverUpStats {
  tvlUSD:                 number
  longOI:                 number
  shortOI:                number
  totalOI:                number
  lvusdSupply:            number
  lvmonSupply:            number
  collateralizationRatio: number
  lvusdBacking:           number
  lvusdIssuerCollateralRatio: number | null
  lvmonIssuerCollateralRatio: number | null
  protocol:               'leverup'
}

/**
 * Returns LeverUp protocol stats: collateral TVL, open interest, LVUSD/LVMON supplies, and issuer collateral ratios.
 *
 * @returns {@link LeverUpStats}
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
  const [
    collateralRaw, longOIRaw, shortOIRaw,
    lvusdSupplyRaw, lvmonSupplyRaw,
    lvusdIssuerCRRaw, lvmonIssuerCRRaw,
  ] = await Promise.allSettled([
    publicClient.readContract({ address: LEVERUP_ADDRESSES.LeverUp, abi: LEVERUP_MAIN_ABI, functionName: 'totalCollateral' }).catch(() =>
      publicClient.readContract({ address: LEVERUP_ADDRESSES.LeverUp, abi: LEVERUP_MAIN_ABI, functionName: 'collateralBalance' })
    ),
    publicClient.readContract({ address: LEVERUP_ADDRESSES.LeverUp, abi: LEVERUP_MAIN_ABI, functionName: 'totalLongPositions' }),
    publicClient.readContract({ address: LEVERUP_ADDRESSES.LeverUp, abi: LEVERUP_MAIN_ABI, functionName: 'totalShortPositions' }),
    publicClient.readContract({ address: LEVERUP_ADDRESSES.LVUSD, abi: ERC20_ABI, functionName: 'totalSupply' }),
    publicClient.readContract({ address: LEVERUP_ADDRESSES.LVMON, abi: ERC20_ABI, functionName: 'totalSupply' }),
    publicClient.readContract({ address: LEVERUP_ADDRESSES.LVUSD_Issuer, abi: ISSUER_ABI, functionName: 'collateralRatio' }),
    publicClient.readContract({ address: LEVERUP_ADDRESSES.LVMON_Issuer, abi: ISSUER_ABI, functionName: 'collateralRatio' }),
  ])

  const monPrice = await getVerifiedPrice('MON').then(r => r.bestPrice)

  const collateral  = collateralRaw.status  === 'fulfilled' ? Number(collateralRaw.value  as bigint) / 1e18 : 0
  const longOI      = longOIRaw.status      === 'fulfilled' ? Number(longOIRaw.value      as bigint) / 1e18 : 0
  const shortOI     = shortOIRaw.status     === 'fulfilled' ? Number(shortOIRaw.value     as bigint) / 1e18 : 0
  const lvusdSupply = lvusdSupplyRaw.status === 'fulfilled' ? Number(lvusdSupplyRaw.value as bigint) / 1e18 : 0
  const lvmonSupply = lvmonSupplyRaw.status === 'fulfilled' ? Number(lvmonSupplyRaw.value as bigint) / 1e18 : 0

  const lvusdIssuerCollateralRatio = lvusdIssuerCRRaw.status === 'fulfilled'
    ? Number(lvusdIssuerCRRaw.value as bigint) / 1e18
    : null
  const lvmonIssuerCollateralRatio = lvmonIssuerCRRaw.status === 'fulfilled'
    ? Number(lvmonIssuerCRRaw.value as bigint) / 1e18
    : null

  const tvlUSD = lvusdSupply + lvmonSupply * monPrice + collateral
  const collateralizationRatio = lvusdSupply > 0 ? tvlUSD / lvusdSupply : 0
  const lvusdBacking = lvmonSupply * monPrice + collateral

  return {
    tvlUSD:                 Math.max(tvlUSD, lvusdSupply),
    longOI:                 longOI * monPrice,
    shortOI:                shortOI * monPrice,
    totalOI:                (longOI + shortOI) * monPrice,
    lvusdSupply,
    lvmonSupply,
    collateralizationRatio,
    lvusdBacking,
    lvusdIssuerCollateralRatio,
    lvmonIssuerCollateralRatio,
    protocol:               'leverup',
  }
}

/**
 * Returns LeverUp leveraged markets as PerpMarket-compatible structs.
 *
 * Exposes three market entries: MON (main market), LVUSD and LVMON as synthetic assets.
 * `fundingRate` is read from the contract's `fundingRate()` view (int256, 18 decimals, per-second).
 * `maxLeverage` is read from `maxLeverage()` view (uint256, likely basis points or integer).
 *
 * @returns Array of market entries shaped as PerpMarket structs
 *
 * @example
 * ```typescript
 * const markets = await getLeverUpMarkets()
 * // → [{ protocol: 'leverup', asset: 'MON', longOI: 600000, maxLeverage: 20, fundingRate: -0.0001, ... }]
 * ```
 *
 * @category Perps
 */
export async function getLeverUpMarkets() {
  const [stats, fundingRateRaw, maxLeverageRaw] = await Promise.all([
    getLeverUpStats(),
    publicClient.readContract({ address: LEVERUP_ADDRESSES.LeverUp, abi: LEVERUP_MAIN_ABI, functionName: 'fundingRate' }).catch(() => null),
    publicClient.readContract({ address: LEVERUP_ADDRESSES.LeverUp, abi: LEVERUP_MAIN_ABI, functionName: 'maxLeverage' }).catch(() => null),
  ])

  const fundingRate = fundingRateRaw !== null
    ? Number(fundingRateRaw as bigint) / 1e18
    : 0

  const maxLeverage = maxLeverageRaw !== null
    ? (() => {
        const raw = Number(maxLeverageRaw as bigint)
        if (raw > 1000) return raw / 100
        if (raw === 0) return 1
        return raw
      })()
    : 0

  const longFundingAPR = fundingRate * 365 * 24 * 3600

  const sentiment = stats.longOI > stats.shortOI * 1.1
    ? 'bullish' as const
    : stats.shortOI > stats.longOI * 1.1
      ? 'bearish' as const
      : 'neutral' as const

  return [
    {
      protocol:       'leverup' as const,
      asset:          'MON',
      longOI:         stats.longOI,
      shortOI:        stats.shortOI,
      totalOI:        stats.totalOI,
      fundingRate,
      longFundingAPR,
      maxLeverage,
      sentiment,
    },
    {
      protocol:       'leverup' as const,
      asset:          'LVUSD',
      longOI:         stats.lvusdSupply,
      shortOI:        0,
      totalOI:        stats.lvusdSupply,
      fundingRate:    0,
      longFundingAPR: 0,
      maxLeverage,
      sentiment:      'neutral' as const,
    },
    {
      protocol:       'leverup' as const,
      asset:          'LVMON',
      longOI:         stats.lvmonSupply,
      shortOI:        0,
      totalOI:        stats.lvmonSupply,
      fundingRate:    0,
      longFundingAPR: 0,
      maxLeverage,
      sentiment:      'neutral' as const,
    },
  ]
}
