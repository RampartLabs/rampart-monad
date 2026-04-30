/**
 * @module Perps
 * @description Perpetuals protocols on Monad: Perpl Exchange and Monday Trade.
 *
 * **Perpl Exchange** — fully on-chain perpetuals (BTC, MON, ETH, SOL).
 * ABI sourced from https://github.com/PerplFoundation/dex-sdk.
 * Collateral: AUSD (6 dec). TVL ~$1.08M.
 * perpIds discovered dynamically (1–50 probe).
 *
 * **Monday Trade** — Uniswap V3 fork DEX (spot only, Uni V3 ABI applies).
 * Perpetuals layer runs on SynFutures infrastructure (unverified contracts).
 *
 * **TVL:** ~$1.1M (Perpl)
 * **Type:** Perpetuals
 * **Docs:** https://app.perpl.xyz | https://monday.trade
 *
 * Available functions:
 * - {@link getMondayMarkets} — Monday Trade spot pools (Uniswap V3 factory)
 * - {@link getPerplMarkets} — Perpl perpetual markets with OI, price, funding rates
 * - {@link getPerplTVL} — total AUSD collateral in Perpl Exchange
 * - {@link getPerpVaultStats} — vault utilization and TVL for all perp protocols
 * - {@link getFundingRates} — current funding rates across perp protocols
 * - {@link getTotalPerpTVL} — combined TVL across all perp protocols on Monad
 */

import { publicClient } from '../chain'

// ── Monday Trade ─────────────────────────────────────────────
// Uniswap V3 fork — spot DEX (standard Uni V3 factory ABI)
const MONDAY_FACTORY:     `0x${string}` = '0xC1e98D0A2a58fB8aBd10ccc30a58efff4080Aa21'
const MONDAY_SWAP_ROUTER: `0x${string}` = '0xFE951b693A2FE54BE5148614B109E316B567632F'
const MONDAY_QUOTER_V2:   `0x${string}` = '0xB97eCD41Aef0F842E773C8F9905919cDE49880C9'

// ── Perpl Exchange ────────────────────────────────────────────
// UUPS proxy; implementation 0xff7b68ae2edf9b87178570a2384097a99520e97e
// ABI: github.com/PerplFoundation/dex-sdk/blob/main/abi/dex/Exchange.json
const PERPL_EXCHANGE: `0x${string}` = '0x34B6552d57a35a1D042CcAe1951BD1C370112a6F'

// CNS = AUSD with 6 decimals; PNS = price in 10^priceDecimals; LNS = lot in 10^lotDecimals
const EXCHANGE_INFO_ABI = [{
  name: 'getExchangeInfo', type: 'function' as const, stateMutability: 'view' as const,
  inputs: [],
  outputs: [{ type: 'tuple', components: [
    { name: 'balanceCNS',         type: 'uint256' },
    { name: 'protocolBalanceCNS', type: 'uint256' },
    { name: 'recycleBalanceCNS',  type: 'uint256' },
    { name: 'collateralDecimals', type: 'uint256' },
    { name: 'collateralToken',    type: 'address' },
    { name: 'verifierProxy',      type: 'address' },
  ]}]
}] as const

const PERP_INFO_ABI = [{
  name: 'getPerpetualInfo', type: 'function' as const, stateMutability: 'view' as const,
  inputs: [{ name: 'perpId', type: 'uint256' }],
  outputs: [{ type: 'tuple', components: [
    { name: 'name',                     type: 'string'  },
    { name: 'symbol',                   type: 'string'  },
    { name: 'priceDecimals',            type: 'uint256' },
    { name: 'lotDecimals',              type: 'uint256' },
    { name: 'linkFeedId',               type: 'bytes32' },
    { name: 'priceTolPer100K',          type: 'uint256' },
    { name: 'marginTol',                type: 'uint256' },
    { name: 'marginTolDecimals',        type: 'uint256' },
    { name: 'refPriceMaxAgeSec',        type: 'uint256' },
    { name: 'positionBalanceCNS',       type: 'uint256' },
    { name: 'insuranceBalanceCNS',      type: 'uint256' },
    { name: 'markPNS',                  type: 'uint256' },
    { name: 'markTimestamp',            type: 'uint256' },
    { name: 'lastPNS',                  type: 'uint256' },
    { name: 'lastTimestamp',            type: 'uint256' },
    { name: 'oraclePNS',                type: 'uint256' },
    { name: 'oracleTimestampSec',       type: 'uint256' },
    { name: 'longOpenInterestLNS',      type: 'uint256' },
    { name: 'shortOpenInterestLNS',     type: 'uint256' },
    { name: 'fundingStartBlock',        type: 'uint256' },
    { name: 'fundingRatePct100k',       type: 'int16'   },
    { name: 'absFundingClampPctPer100K',type: 'uint256' },
    { name: 'status',                   type: 'uint8'   },
    { name: 'basePricePNS',             type: 'uint256' },
    { name: 'maxBidPriceONS',           type: 'uint256' },
    { name: 'minBidPriceONS',           type: 'uint256' },
    { name: 'maxAskPriceONS',           type: 'uint256' },
    { name: 'minAskPriceONS',           type: 'uint256' },
    { name: 'numOrders',                type: 'uint256' },
    { name: 'ignOracle',                type: 'bool'    },
  ]}]
}] as const

const MISC_ABI = [
  { name: 'numberOfAccounts',  type: 'function' as const, stateMutability: 'view' as const, inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'getFundingInterval',type: 'function' as const, stateMutability: 'view' as const, inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'isHalted',          type: 'function' as const, stateMutability: 'view' as const, inputs: [], outputs: [{ type: 'bool'    }] },
] as const

// Uniswap V3 factory — used for Monday Trade pool discovery
const UNI_V3_FACTORY_ABI = [
  { name: 'getPool', type: 'function' as const, stateMutability: 'view' as const,
    inputs: [{ name: 'tokenA', type: 'address' }, { name: 'tokenB', type: 'address' }, { name: 'fee', type: 'uint24' }],
    outputs: [{ type: 'address' }] },
] as const

export interface PerpMarket {
  protocol:          'monday' | 'perpl'
  perpId:            number
  asset:             string
  markPrice:         number
  oraclePrice:       number
  longOI:            number
  shortOI:           number
  totalOI:           number
  fundingRatePct:    number
  fundingInterval:   number
  tvlUSD:            number
  maxBid:            number
  minBid:            number
  sentiment:         'bullish' | 'bearish' | 'neutral'
}

export interface PerpVaultStats {
  protocol:        'monday' | 'perpl'
  tvl:             number
  totalOI:         number
  utilizationRate: number
  accounts:        number
}

async function probePerplMarkets(): Promise<PerpMarket[]> {
  const fundingInterval = await publicClient.readContract({
    address: PERPL_EXCHANGE, abi: MISC_ABI, functionName: 'getFundingInterval',
  }).catch(() => 8571n)

  const results = await Promise.allSettled(
    Array.from({ length: 50 }, (_, i) =>
      publicClient.readContract({
        address: PERPL_EXCHANGE, abi: PERP_INFO_ABI, functionName: 'getPerpetualInfo', args: [BigInt(i + 1)],
      })
    )
  )

  const markets: PerpMarket[] = []
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.status !== 'fulfilled') continue
    const p = r.value as {
      name: string; symbol: string; priceDecimals: bigint; lotDecimals: bigint;
      positionBalanceCNS: bigint; markPNS: bigint; oraclePNS: bigint;
      longOpenInterestLNS: bigint; shortOpenInterestLNS: bigint;
      fundingRatePct100k: number; maxBidPriceONS: bigint; minBidPriceONS: bigint;
    }
    const pd    = Number(p.priceDecimals)
    const ld    = Number(p.lotDecimals)
    const scale = 10 ** pd
    const longOI  = Number(p.longOpenInterestLNS)  / 10 ** ld
    const shortOI = Number(p.shortOpenInterestLNS) / 10 ** ld
    markets.push({
      protocol:        'perpl',
      perpId:          i + 1,
      asset:           p.symbol,
      markPrice:       Number(p.markPNS)    / scale,
      oraclePrice:     Number(p.oraclePNS)  / scale,
      longOI,
      shortOI,
      totalOI:         longOI + shortOI,
      fundingRatePct:  p.fundingRatePct100k / 100000,
      fundingInterval: Number(fundingInterval),
      tvlUSD:          Number(p.positionBalanceCNS) / 1e6,
      maxBid:          Number(p.maxBidPriceONS) / scale,
      minBid:          Number(p.minBidPriceONS) / scale,
      sentiment:       longOI > shortOI * 1.1 ? 'bullish' : shortOI > longOI * 1.1 ? 'bearish' : 'neutral',
    })
  }
  return markets
}

/**
 * Returns Monday Trade spot pools from the Uniswap V3 factory on Monad.
 * Monday Trade is a Uniswap V3 fork; perpetuals run on unverified SynFutures contracts.
 * Returns empty array — use {@link getUniswapPools} / Kuru for Monday spot liquidity.
 *
 * @returns Empty array (Monday perp ABI not yet publicly available)
 *
 * @category Perps
 */
export async function getMondayMarkets(): Promise<PerpMarket[]> {
  return []
}

/**
 * Returns Perpl Exchange perpetual markets with open interest, mark price, and funding rates.
 * Probes perpIds 1–50 dynamically — currently active: BTC (1), MON (10), ETH (20), SOL (30).
 *
 * @returns Array of {@link PerpMarket} sorted descending by `tvlUSD`
 *
 * @example
 * ```typescript
 * const markets = await getPerplMarkets()
 * // → [{ asset: 'MON Perp', markPrice: 0.0265, longOI: 1856568, tvlUSD: 40698 }]
 * ```
 *
 * @category Perps
 */
export async function getPerplMarkets(): Promise<PerpMarket[]> {
  try {
    const markets = await probePerplMarkets()
    return markets.sort((a, b) => b.tvlUSD - a.tvlUSD)
  } catch {
    return []
  }
}

/**
 * Returns total AUSD collateral locked in Perpl Exchange.
 * Uses `getExchangeInfo().balanceCNS` — the official on-chain total.
 *
 * @returns TVL in USD (AUSD, 6 decimals, 1:1 with USD)
 *
 * @example
 * ```typescript
 * const tvl = await getPerplTVL()
 * // → 1080962
 * ```
 *
 * @category Perps
 */
export async function getPerplTVL(): Promise<number> {
  try {
    const info = await publicClient.readContract({
      address: PERPL_EXCHANGE, abi: EXCHANGE_INFO_ABI, functionName: 'getExchangeInfo',
    }) as { balanceCNS: bigint }
    return Number(info.balanceCNS) / 1e6
  } catch {
    return 0
  }
}

/**
 * Returns vault utilization and TVL stats for all perpetual protocols on Monad.
 *
 * @returns Array of {@link PerpVaultStats} for Perpl
 *
 * @example
 * ```typescript
 * const stats = await getPerpVaultStats()
 * // → [{ protocol: 'perpl', tvl: 1080962, totalOI: 83000, utilizationRate: 0.077, accounts: 534 }]
 * ```
 *
 * @category Perps
 */
export async function getPerpVaultStats(): Promise<PerpVaultStats[]> {
  try {
    const [info, markets, accounts] = await Promise.all([
      publicClient.readContract({ address: PERPL_EXCHANGE, abi: EXCHANGE_INFO_ABI, functionName: 'getExchangeInfo' }) as Promise<{ balanceCNS: bigint }>,
      getPerplMarkets(),
      publicClient.readContract({ address: PERPL_EXCHANGE, abi: MISC_ABI, functionName: 'numberOfAccounts' }).catch(() => 0n),
    ])
    const tvl     = Number(info.balanceCNS) / 1e6
    const totalOI = markets.reduce((s, m) => s + m.tvlUSD, 0)
    return [{
      protocol:        'perpl',
      tvl,
      totalOI,
      utilizationRate: tvl > 0 ? totalOI / tvl : 0,
      accounts:        Number(accounts),
    }]
  } catch {
    return []
  }
}

/**
 * Returns current funding rates across all Perpl perpetual markets.
 *
 * @returns Array of objects with `protocol`, `asset`, `rate` (% per funding interval), `fundingInterval` (blocks)
 *
 * @example
 * ```typescript
 * const rates = await getFundingRates()
 * // → [{ protocol: 'perpl', asset: 'BTC Perp', rate: 0, fundingInterval: 8571 }]
 * ```
 *
 * @category Perps
 */
export async function getFundingRates(): Promise<{
  protocol: string; asset: string; rate: number; fundingInterval: number
}[]> {
  const markets = await getPerplMarkets()
  return markets.map(m => ({
    protocol:        m.protocol,
    asset:           m.asset,
    rate:            m.fundingRatePct,
    fundingInterval: m.fundingInterval,
  }))
}

/**
 * Returns combined TVL in USD across all perpetual protocols on Monad.
 *
 * @returns Total TVL in USD
 *
 * @example
 * ```typescript
 * const tvl = await getTotalPerpTVL()
 * // → 1080962
 * ```
 *
 * @category Perps
 */
export async function getTotalPerpTVL(): Promise<number> {
  return getPerplTVL()
}

export { MONDAY_FACTORY, MONDAY_SWAP_ROUTER, MONDAY_QUOTER_V2, PERPL_EXCHANGE }
