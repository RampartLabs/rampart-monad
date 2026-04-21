/**
 * @module Oracles
 * @description Multi-source price oracle aggregator for Monad mainnet.
 * Queries Chainlink, Pyth, Redstone, Chronicle on-chain feeds and Kuru DEX in parallel,
 * returns median-validated prices with deviation warnings.
 *
 * **TVL:** N/A
 * **Type:** Price Oracle Aggregator
 * **Docs:** https://docs.redstone.finance
 *
 * Available functions:
 * - {@link getRedstonePrice} — Redstone push feed price (on-chain preferred, HTTP fallback)
 * - {@link getChroniclePrice} — Chronicle oracle price (WAD-scaled, MON/USD only)
 * - {@link getLSTRatios} — cumulative MON-per-LST exchange rates for all 4 LSTs from Redstone
 * - {@link getVerifiedPrice} — cross-validated median price from all oracle sources
 * - {@link getPrices} — batch verified prices for multiple tokens
 * - {@link getChainlinkRawPrice} — raw Chainlink feed value without cross-checking
 * - {@link detectOracleDiscrepancy} — per-source breakdown and cross-oracle spread check
 */

// ============================================================
// Rampart SDK — Oracle Aggregator (Phase 2)
// Sources: Chainlink · Pyth · Redstone · Chronicle · Kuru DEX
// All feeds verified from monad-crypto/protocols + data.chain.link
// getVerifiedPrice() cross-checks all sources, returns median
// ============================================================

import { publicClient } from '../chain'
import { getTokenPrice as getKuruTokenPrice } from './kuru'

// Chainlink feeds on Monad mainnet — verified from monad-crypto/protocols/mainnet/chainlink.jsonc
// MON/USD note: on-chain oracles return ~$0.031; Kuru DEX returns ~$0.31 (10x delta).
// Chainlink, Pyth, Redstone, Chronicle all agree at ~$0.031 — DEX price outlier noted in warning.
const CHAINLINK_FEEDS: Record<string, `0x${string}`> = {
  MON:  '0xBcD78f76005B7515837af6b50c7C52BCf73822fb',
  WMON: '0xBcD78f76005B7515837af6b50c7C52BCf73822fb',
  USDC: '0xf5F15f188AbCb0d165D1Edb7f37F7d6fA2fCebec',
  USDT: '0x1a1Be4c184923a6BFF8c27cfDf6ac8bDE4DE00FC',
  ETH:  '0x1B1414782B859871781bA3E4B0979b9ca57A0A04',
  WETH: '0x1B1414782B859871781bA3E4B0979b9ca57A0A04',
  BTC:  '0xc1d4C3331635184fA4C3c22fb92211B2Ac9E0546',
  WBTC: '0xc1d4C3331635184fA4C3c22fb92211B2Ac9E0546',
  SOL:  '0x16F8008c3e89f62e5e2b909Ce70999370D38F4F2',
}

// Pyth price feed IDs (verified 2026-04-18 via hermes.pyth.network/v2/price_feeds)
const PYTH_CONTRACT: `0x${string}` = '0x2880aB155794e7179c9eE2e38200202908C17B43'
const PYTH_FEED_IDS: Record<string, `0x${string}`> = {
  MON:  '0x31491744e2dbf6df7fcf4ac0820d18a609b49076d45066d3568424e62f686cd1',
  WMON: '0x31491744e2dbf6df7fcf4ac0820d18a609b49076d45066d3568424e62f686cd1',
  USDC: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
  ETH:  '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  BTC:  '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  WETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
}

// Redstone feed IDs — verified via redstone-primary-prod data service
// LST ratios (gMON_FUNDAMENTAL etc.) return MON-per-LST exchange rate since inception
const REDSTONE_FEED_IDS: Record<string, string> = {
  MON:  'MON',
  WMON: 'MON',
  ETH:  'ETH',
  WETH: 'ETH',
  BTC:  'BTC',
  WBTC: 'WBTC',
  USDC: 'USDC',
  USDT: 'USDT',
  SOL:  'SOL',
}
const REDSTONE_GATEWAY = 'https://oracle-gateway-1.a.redstone.finance'
const REDSTONE_SERVICE = 'redstone-primary-prod'

// Redstone on-chain LST ratio feeds (Chainlink-compatible interface)
// Verified from monad-crypto/protocols/mainnet/redstone.jsonc
const REDSTONE_LST_ONCHAIN: Record<string, `0x${string}`> = {
  gMON:   '0x8C9f39f0D08EE284a4Fe0198524fE7C28630CEAb',
  shMON:  '0xAd1A270a3F7FF685B90445d9da3EE7Eb22F8A1Ec',
  sMON:   '0xE77456457619ad1948336FBaBC3883cB965b50D1',
  aprMON: '0x096073133355F874A7D0a857Ffac314dda4e0551',
}

// Redstone on-chain price feeds (Chainlink-compatible) — supplement HTTP API
const REDSTONE_PRICE_ONCHAIN: Record<string, `0x${string}`> = {
  MON:  '0x1C9582E87eD6E99bc23EC0e6Eb52eE9d7C0D6bcd',
  WMON: '0x1C9582E87eD6E99bc23EC0e6Eb52eE9d7C0D6bcd',
  ETH:  '0xc44be6D00307c3565FDf753e852Fc003036cBc13',
  WETH: '0xc44be6D00307c3565FDf753e852Fc003036cBc13',
  BTC:  '0xED2B1ca5D7E246f615c2291De309643D41FeC97e',
  USDC: '0x7A9b672fc20b5C89D6774514052b3e0899E5E263',
}

// Chronicle MON/USD feed — verified on Monad mainnet
// tryRead() returns (bool ok, uint256 val) where val is WAD-scaled (18 decimals)
const CHRONICLE_MON_FEED: `0x${string}` = '0x936a444C983347FFBfe3F26D1497CAbfA2BfE271'
const CHRONICLE_FEEDS: Record<string, `0x${string}`> = {
  MON:  CHRONICLE_MON_FEED,
  WMON: CHRONICLE_MON_FEED,
}

// ─── ABIs ────────────────────────────────────────────────────────────────────

const CHAINLINK_ABI = [
  {
    name: 'latestRoundData',
    type: 'function' as const,
    inputs: [],
    outputs: [
      { name: 'roundId',         type: 'uint80'  },
      { name: 'answer',          type: 'int256'  },
      { name: 'startedAt',       type: 'uint256' },
      { name: 'updatedAt',       type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80'  },
    ],
    stateMutability: 'view' as const,
  },
  {
    name: 'decimals',
    type: 'function' as const,
    inputs: [],
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view' as const,
  },
] as const

const PYTH_ABI = [
  {
    name: 'getPriceUnsafe',
    type: 'function' as const,
    inputs: [{ name: 'id', type: 'bytes32' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'price',       type: 'int64'  },
          { name: 'conf',        type: 'uint64' },
          { name: 'expo',        type: 'int32'  },
          { name: 'publishTime', type: 'uint256'},
        ],
      },
    ],
    stateMutability: 'view' as const,
  },
] as const

const CHRONICLE_ABI = [
  {
    name: 'tryRead',
    type: 'function' as const,
    inputs: [],
    outputs: [
      { name: 'ok',  type: 'bool'    },
      { name: 'val', type: 'uint256' },
    ],
    stateMutability: 'view' as const,
  },
] as const

// Chainlink-compatible ABI used by Redstone on-chain push feeds
const LATEST_ANSWER_ABI = [
  {
    name: 'latestAnswer',
    type: 'function' as const,
    inputs: [],
    outputs: [{ type: 'int256' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'decimals',
    type: 'function' as const,
    inputs: [],
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view' as const,
  },
] as const

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OraclePrice {
  token:     string
  price:     number        // USD price
  source:    'chainlink' | 'pyth' | 'redstone' | 'chronicle' | 'kuru-dex'
  updatedAt: number        // unix timestamp
  confidence?: number      // Pyth confidence interval
  stale?:    boolean       // if updatedAt > 10 min ago
}

export interface VerifiedPrice {
  token:       string
  bestPrice:   number       // median price across all responding sources
  sources:     OraclePrice[]
  deviation:   number       // max % deviation across sources
  warning?:    string       // if deviation > 1% or staleness detected
  consensus:   boolean      // true if all sources agree within 1%
}

/**
 * LST exchange ratios relative to MON (how many MON per 1 LST token).
 * Sourced exclusively from Redstone oracle — unique Monad feeds.
 * Values grow over time as LSTs accrue staking rewards.
 */
export interface LSTRatios {
  gMON:   number   // gMON/MON exchange rate (e.g. 1.0504)
  shMON:  number   // shMON/MON exchange rate (e.g. 1.543)
  sMON:   number   // sMON/MON exchange rate  (e.g. 1.0568)
  aprMON: number   // aprMON/MON exchange rate (e.g. 1.0463)
  updatedAt: number
}

// ─── Source fetchers ─────────────────────────────────────────────────────────

async function getChainlinkPrice(token: string): Promise<OraclePrice | null> {
  const feed = CHAINLINK_FEEDS[token.toUpperCase()]
  if (!feed) return null
  try {
    const [roundData, decimals] = await Promise.all([
      publicClient.readContract({ address: feed, abi: CHAINLINK_ABI, functionName: 'latestRoundData' }),
      publicClient.readContract({ address: feed, abi: CHAINLINK_ABI, functionName: 'decimals' }),
    ])
    const [, answer, , updatedAt] = roundData as [bigint, bigint, bigint, bigint, bigint]
    const dec   = Number(decimals)
    const price = Number(answer) / 10 ** dec
    const now   = Math.floor(Date.now() / 1000)
    const stale = now - Number(updatedAt) > 600
    if (price <= 0) return null
    return { token, price, source: 'chainlink', updatedAt: Number(updatedAt), stale }
  } catch {
    return null
  }
}

async function getPythPrice(token: string): Promise<OraclePrice | null> {
  const feedId = PYTH_FEED_IDS[token.toUpperCase()]
  if (!feedId) return null
  try {
    const result = await publicClient.readContract({
      address: PYTH_CONTRACT,
      abi: PYTH_ABI,
      functionName: 'getPriceUnsafe',
      args: [feedId as `0x${string}`],
    })
    const { price: rawPrice, conf, expo, publishTime } = result as {
      price: bigint; conf: bigint; expo: number; publishTime: bigint
    }
    const absExpo    = Math.abs(expo)
    const price      = Number(rawPrice) / 10 ** absExpo
    const confidence = Number(conf)    / 10 ** absExpo
    const now        = Math.floor(Date.now() / 1000)
    const stale      = now - Number(publishTime) > 600
    if (price <= 0) return null
    return { token, price, source: 'pyth', updatedAt: Number(publishTime), confidence, stale }
  } catch {
    return null
  }
}

/**
 * Fetch price from Redstone oracle.
 * Prefers on-chain push feeds (Chainlink-compatible) when available,
 * falls back to HTTP gateway for tokens without an on-chain feed.
 * Supports: MON, ETH, WETH, BTC, WBTC, USDC, USDT, SOL.
 *
 * @param token - Token symbol (e.g. "MON", "ETH", "USDC")
 * @returns OraclePrice with source "redstone", or null if no feed available
 *
 * @example
 * ```typescript
 * const price = await getRedstonePrice('MON')
 * // → { token: 'MON', price: 0.031, source: 'redstone', updatedAt: 1713600000 }
 * ```
 *
 * @category Oracles
 */
export async function getRedstonePrice(token: string): Promise<OraclePrice | null> {
  const upper  = token.toUpperCase()
  const onChain = REDSTONE_PRICE_ONCHAIN[upper]

  // Prefer on-chain feed (no external HTTP dependency)
  if (onChain) {
    try {
      const [raw, dec] = await Promise.all([
        publicClient.readContract({ address: onChain, abi: LATEST_ANSWER_ABI, functionName: 'latestAnswer' }),
        publicClient.readContract({ address: onChain, abi: LATEST_ANSWER_ABI, functionName: 'decimals' }),
      ])
      const price = Number(raw as bigint) / 10 ** Number(dec as number)
      if (price <= 0) return null
      return { token, price, source: 'redstone', updatedAt: Math.floor(Date.now() / 1000) }
    } catch {
      // fall through to HTTP
    }
  }

  // HTTP fallback for tokens without an on-chain push feed
  const feedId = REDSTONE_FEED_IDS[upper]
  if (!feedId) return null
  try {
    const url = `${REDSTONE_GATEWAY}/data-packages/latest/${REDSTONE_SERVICE}?dataFeedIds=${feedId}&maxTimestampDelay=900000`
    const res  = await fetch(url)
    if (!res.ok) return null
    const data: Record<string, Array<{ dataPoints: Array<{ value: number }>; timestampMilliseconds: number }>> = await res.json()
    const pkg  = data[feedId]?.[0]
    if (!pkg) return null
    const price = pkg.dataPoints?.[0]?.value
    if (!price || price <= 0) return null
    const updatedAt = Math.floor((pkg.timestampMilliseconds ?? Date.now()) / 1000)
    const stale     = Math.floor(Date.now() / 1000) - updatedAt > 600
    return { token, price, source: 'redstone', updatedAt, stale }
  } catch {
    return null
  }
}

/**
 * Fetch MON/USD price from Chronicle oracle (on-chain).
 * Returns WAD-scaled uint256 from tryRead(). Currently only MON/USD available.
 *
 * @param token - Token symbol; currently only "MON" and "WMON" have Chronicle feeds
 * @returns OraclePrice with source "chronicle", or null if no feed or read fails
 *
 * @example
 * ```typescript
 * const price = await getChroniclePrice('MON')
 * // → { token: 'MON', price: 0.031, source: 'chronicle', updatedAt: 1713600000 }
 * ```
 *
 * @category Oracles
 */
export async function getChroniclePrice(token: string): Promise<OraclePrice | null> {
  const feed = CHRONICLE_FEEDS[token.toUpperCase()]
  if (!feed) return null
  try {
    const result = await publicClient.readContract({
      address: feed,
      abi:     CHRONICLE_ABI,
      functionName: 'tryRead',
    })
    const [ok, val] = result as [boolean, bigint]
    if (!ok || val === 0n) return null
    const price     = Number(val) / 1e18   // WAD format
    const updatedAt = Math.floor(Date.now() / 1000)
    if (price <= 0) return null
    return { token, price, source: 'chronicle', updatedAt }
  } catch {
    return null
  }
}

async function getKuruDexPrice(token: string): Promise<OraclePrice | null> {
  const upper = token.toUpperCase()
  if (!['MON', 'WMON'].includes(upper)) return null
  try {
    const result = await getKuruTokenPrice('MON', 'USDC')
    if (result.price <= 0) return null
    return { token, price: result.price, source: 'kuru-dex', updatedAt: Math.floor(Date.now() / 1000) }
  } catch {
    return null
  }
}

// ─── LST Ratios ──────────────────────────────────────────────────────────────

/**
 * Fetch LST/MON exchange ratios from Redstone on-chain feeds.
 * These are cumulative exchange rates since each LST launched, not annual APR.
 * Unique to Monad — exclusively available via Redstone push feeds on this chain.
 * Uses Chainlink-compatible latestAnswer() interface (verified from monad-crypto/protocols).
 *
 * @returns LSTRatios object with exchange rates for gMON, shMON, sMON, aprMON and updatedAt timestamp
 *
 * @example
 * ```typescript
 * const ratios = await getLSTRatios()
 * // → { gMON: 1.050, shMON: 1.543, sMON: 1.056, aprMON: 1.046, updatedAt: 1713600000 }
 * ```
 *
 * @category Oracles
 */
export async function getLSTRatios(): Promise<LSTRatios> {
  try {
    const entries = Object.entries(REDSTONE_LST_ONCHAIN)
    const results = await Promise.all(
      entries.map(async ([, addr]) => {
        try {
          const [raw, dec] = await Promise.all([
            publicClient.readContract({ address: addr, abi: LATEST_ANSWER_ABI, functionName: 'latestAnswer' }),
            publicClient.readContract({ address: addr, abi: LATEST_ANSWER_ABI, functionName: 'decimals' }),
          ])
          return Number(raw as bigint) / 10 ** Number(dec as number)
        } catch {
          return 1
        }
      })
    )
    const [gMON, shMON, sMON, aprMON] = results
    return { gMON, shMON, sMON, aprMON, updatedAt: Math.floor(Date.now() / 1000) }
  } catch {
    return { gMON: 1, shMON: 1, sMON: 1, aprMON: 1, updatedAt: 0 }
  }
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid    = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

/**
 * Get cross-validated price for a token from all available oracle sources.
 * Queries Chainlink, Pyth, Redstone, Chronicle (on-chain) + Kuru DEX in parallel.
 * Returns median price across responding sources and flags deviations above 1%.
 *
 * @param token - Token symbol (e.g. "MON", "ETH", "BTC", "USDC")
 * @returns VerifiedPrice with median bestPrice, per-source breakdown, deviation %, and optional warning
 *
 * @example
 * ```typescript
 * const result = await getVerifiedPrice('MON')
 * // → { token: 'MON', bestPrice: 0.031, deviation: 0.4, consensus: true, sources: [...] }
 * ```
 *
 * @category Oracles
 */
export async function getVerifiedPrice(token: string): Promise<VerifiedPrice> {
  const [cl, pyth, rs, chron, dex] = await Promise.all([
    getChainlinkPrice(token),
    getPythPrice(token),
    getRedstonePrice(token),
    getChroniclePrice(token),
    getKuruDexPrice(token),
  ])

  const sources = [cl, pyth, rs, chron, dex].filter((s): s is OraclePrice => s !== null && s.price > 0)

  if (sources.length === 0) {
    throw new Error(`No oracle data available for ${token}`)
  }

  const prices  = sources.map(s => s.price)
  const maxP    = Math.max(...prices)
  const minP    = Math.min(...prices)
  const deviation = minP > 0 ? ((maxP - minP) / minP) * 100 : 0

  // Compute median across all responding sources
  const bestPrice = median(prices)

  let warning: string | undefined

  // Detect oracle-vs-DEX split: if non-DEX sources and DEX disagree by > 50%
  const onChainPrices = sources.filter(s => s.source !== 'kuru-dex').map(s => s.price)
  if (dex && onChainPrices.length > 0) {
    const onChainMedian = median(onChainPrices)
    const dexDeviation  = Math.abs(dex.price - onChainMedian) / onChainMedian * 100
    if (dexDeviation > 50) {
      warning = `⚠️ DEX price ($${dex.price.toFixed(4)}) vs oracle consensus ($${onChainMedian.toFixed(4)}) — ${dexDeviation.toFixed(0)}% spread`
    }
  }

  if (deviation > 10 && !warning) {
    warning = `⚠️ Large price deviation ${deviation.toFixed(1)}% across sources — possible stale oracle`
  } else if (deviation > 1 && !warning) {
    warning = `Price deviation ${deviation.toFixed(1)}% across sources`
  }

  if (sources.some(s => s.stale)) {
    const staleNames = sources.filter(s => s.stale).map(s => s.source).join(', ')
    warning = (warning ? warning + ' | ' : '') + `Stale: ${staleNames}`
  }

  return {
    token,
    bestPrice,
    sources,
    deviation,
    warning,
    consensus: deviation <= 1,
  }
}

/**
 * Get verified prices for multiple tokens in a single batch call.
 * Failed individual lookups are silently dropped; only successful results are returned.
 *
 * @param tokens - Array of token symbols (e.g. ["MON", "ETH", "USDC"])
 * @returns Array of VerifiedPrice entries for tokens that had at least one oracle response
 *
 * @example
 * ```typescript
 * const prices = await getPrices(['MON', 'ETH', 'USDC'])
 * // → [{ token: 'MON', bestPrice: 0.031, ... }, { token: 'ETH', bestPrice: 1800, ... }, ...]
 * ```
 *
 * @category Oracles
 */
export async function getPrices(tokens: string[]): Promise<VerifiedPrice[]> {
  const results = await Promise.allSettled(tokens.map(t => getVerifiedPrice(t)))
  return results
    .filter((r): r is PromiseFulfilledResult<VerifiedPrice> => r.status === 'fulfilled')
    .map(r => r.value)
}

/**
 * Get raw Chainlink feed price without cross-checking against other oracles.
 * Useful when you specifically need Chainlink data or want to avoid extra RPC calls.
 *
 * @param token - Token symbol (e.g. "MON", "ETH", "BTC", "USDC", "SOL")
 * @returns OraclePrice with source "chainlink", or null if no feed is configured
 *
 * @example
 * ```typescript
 * const price = await getChainlinkRawPrice('ETH')
 * // → { token: 'ETH', price: 1800.5, source: 'chainlink', updatedAt: 1713600000 }
 * ```
 *
 * @category Oracles
 */
export async function getChainlinkRawPrice(token: string): Promise<OraclePrice | null> {
  return getChainlinkPrice(token)
}

/**
 * Detect price discrepancy for a token across all oracle sources.
 * Returns per-source prices and flags tokens where max deviation exceeds 5%.
 * Useful for MEV opportunity detection and arb scanning.
 *
 * @param token - Token symbol to check (e.g. "MON", "ETH")
 * @returns Object with individual oracle prices, maxDeviation %, and isDiscrepant flag (true if > 5%)
 *
 * @example
 * ```typescript
 * const result = await detectOracleDiscrepancy('MON')
 * // → { token: 'MON', chainlinkPrice: 0.031, dexPrice: 0.354, maxDeviation: 1042, isDiscrepant: true }
 * ```
 *
 * @category Oracles
 */
export async function detectOracleDiscrepancy(token: string): Promise<{
  token:           string
  chainlinkPrice:  number | null
  pythPrice:       number | null
  redstonePrice:   number | null
  chroniclePrice:  number | null
  dexPrice:        number | null
  maxDeviation:    number
  isDiscrepant:    boolean
}> {
  const verified = await getVerifiedPrice(token)
  const cl    = verified.sources.find(s => s.source === 'chainlink')?.price  ?? null
  const py    = verified.sources.find(s => s.source === 'pyth')?.price       ?? null
  const rs    = verified.sources.find(s => s.source === 'redstone')?.price   ?? null
  const ch    = verified.sources.find(s => s.source === 'chronicle')?.price  ?? null
  const dex   = verified.sources.find(s => s.source === 'kuru-dex')?.price   ?? null
  return {
    token,
    chainlinkPrice:  cl,
    pythPrice:       py,
    redstonePrice:   rs,
    chroniclePrice:  ch,
    dexPrice:        dex,
    maxDeviation:    verified.deviation,
    isDiscrepant:    verified.deviation > 5,
  }
}
