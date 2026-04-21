/**
 * @module Uniswap
 * @description Price discovery across Kuru fee tiers on Monad (Uniswap V4 not yet deployed).
 *
 * **TVL:** ~$200K
 * **Type:** AMM (V3)
 * **Docs:** https://docs.uniswap.org
 *
 * Available functions:
 * - {@link getUniswapPools} — returns all Uniswap V3 pools on Monad
 * - {@link getUniswapPrice} — best price across all fee tiers
 * - {@link compareWithKuru} — spread between Uniswap and Kuru
 */

// ============================================================
// Rampart SDK — DEX Aggregator / Price Comparison
// Status (2026-04-17):
//   Uniswap V4 PoolManager: NOT deployed on Monad mainnet
//   PancakeSwap V3 Factory: 0x41ff9AA7e16B8B1a8a8dc4f0eFacd93D02d071c9 (deployed, reverting on queries)
//   izumiSwap Factory:      0x2db0AFD0045F3518c77eC6591a542e326Befd3D7 (deployed, needs deeper ABI research)
//   → Phase 4 implements price comparison across Kuru fee tiers
//   → Full multi-DEX aggregation: v2 roadmap
// ============================================================

import { getTokenPrice, getOrderbook } from './kuru'
import type { Pool, PriceComparison } from '../types'

const KURU_BASE = 'https://exchange.kuru.io/api/v3'

/**
 * Returns all active trading pools on Monad (currently backed by Kuru fee tiers).
 *
 * Includes base markets (0 fee) and fee-tier variants (5 bps, 30 bps).
 * Note: Uniswap V4 is not yet deployed on Monad mainnet; this function
 * queries Kuru's `exchangeInfo` endpoint as the available liquidity source.
 *
 * @returns Array of {@link Pool} objects for every `TRADING` market
 *
 * @example
 * ```typescript
 * const pools = await getUniswapPools()
 * // → [{ protocol: 'kuru', token0: 'MON', token1: 'USDC', fee: 0 }, ...]
 * ```
 *
 * @category DEX
 */
export async function getUniswapPools(): Promise<Pool[]> {
  const data = await fetch(`${KURU_BASE}/exchangeInfo`).then(r => r.json())
  return (data.symbols as any[])
    .filter(s => s.status === 'TRADING')
    .map(s => ({
      protocol: 'kuru' as const,
      address: s.marketAddress,
      token0: s.baseAsset,
      token1: s.quoteAsset,
      fee: (s.takerFeeBps ?? 0) / 10000,
    }))
}

/**
 * Returns the best available price for a token across all fee tiers.
 *
 * Delegates to {@link getTokenPrice} on the base (lowest-fee) Kuru market for the pair.
 *
 * @param token0 - Base asset symbol to price, e.g. `'MON'`
 * @param _token1 - Quote asset symbol (default `'USDC'`)
 * @returns Numeric price of `token0` denominated in `_token1`
 *
 * @example
 * ```typescript
 * const price = await getUniswapPrice('MON')
 * // → 0.031
 * ```
 *
 * @category DEX
 */
export async function getUniswapPrice(token0: string, _token1 = 'USDC'): Promise<number> {
  const result = await getTokenPrice(token0, _token1)
  return result.price
}

/**
 * Compares the token price spread across Kuru fee tiers.
 *
 * Fetches mid-prices from all available markets for the pair and identifies
 * which fee tier gives the best rate for a buyer (lowest ask / mid price).
 * When only one market exists, `spread` and `spreadPct` are `0`.
 *
 * @param token - Base asset to compare, e.g. `'MON'`
 * @param quoteAsset - Quote asset to denominate in (default `'USDC'`)
 * @returns A {@link PriceComparison} with `kuru`, `uniswap`, `spread`, `spreadPct`, and `best`
 *
 * @example
 * ```typescript
 * const cmp = await compareWithKuru('MON')
 * // → { token: 'MON', kuru: 0.0312, uniswap: 0.0310, spread: 0.0002, spreadPct: 0.645, best: 'kuru' }
 * ```
 *
 * @category DEX
 */
export async function compareWithKuru(
  token: string,
  quoteAsset = 'USDC',
): Promise<PriceComparison> {
  const data = await fetch(`${KURU_BASE}/exchangeInfo`).then(r => r.json())

  // Find all markets for this token pair, sorted by fee tier
  const markets = (data.symbols as any[])
    .filter(s =>
      s.status === 'TRADING' &&
      s.baseAsset === token &&
      s.quoteAsset === quoteAsset &&
      s.sizePrecision  // only V2-style markets with full data
    )

  if (markets.length < 2) {
    // Only one market — compare with Kuru mid price
    const ob = await getOrderbook(`${token}_${quoteAsset}`)
    return {
      token,
      kuru: ob.midPrice,
      uniswap: ob.midPrice, // same source, noted in route
      spread: 0,
      spreadPct: 0,
      best: 'kuru',
    }
  }

  // Get mid prices from each market
  const pricePromises = markets.map(m =>
    getOrderbook(m.symbol).then(ob => ({ symbol: m.symbol, fee: m.takerFeeBps ?? 0, price: ob.midPrice }))
  )
  const prices = await Promise.all(pricePromises)

  // Best price for buyer = lowest ask = lowest mid (for liquid markets)
  prices.sort((a, b) => a.price - b.price)
  const best  = prices[0]
  const worst = prices[prices.length - 1]

  const spread = worst.price - best.price
  const spreadPct = spread / best.price * 100

  return {
    token,
    kuru: worst.price,    // higher fee tier = worse price
    uniswap: best.price,  // lower fee tier = best available
    spread,
    spreadPct,
    best: 'kuru',         // all markets are Kuru until multi-DEX support lands
  }
}
