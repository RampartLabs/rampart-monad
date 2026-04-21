/**
 * @module Kuru
 * @description On-chain CLOB DEX on Monad — orderbook-based AMM with native MON trading pairs.
 *
 * **TVL:** ~$1.1M
 * **Type:** CLOB DEX
 * **Docs:** https://docs.kuru.io
 *
 * Available functions:
 * - {@link getTokenPrice} — fetches live price from Kuru CLOB pools
 * - {@link getKuruPools} — returns all active Kuru liquidity pools
 * - {@link getOrderbook} — returns bid/ask ladder for a market symbol
 * - {@link simulateKuruSwap} — simulates exact-in swap output
 */

// ============================================================
// Rampart SDK — Kuru DEX Module
// API: https://exchange.kuru.io/api/v3/
// ============================================================
//
// Price format (verified 2026-04-17 empirically):
//   price_USD = raw_price / 1e17   (for 18-dec base / 6-dec quote)
//   size_base = raw_size / sizePrecision (from exchangeInfo)
//
// Available symbols: MON_USDC, MON_AUSD, WBTC_AUSD, AUSD_USDC
//   + V3/V4 variants with fee tiers (5, 30 bps)
// Market addresses are in exchangeInfo response.
//
// Fees: takerFeeBps and makerFeeBps per market (0 for base markets)

import type { TokenPrice, Pool, Orderbook, SwapSimulation } from '../types'

const KURU_BASE = 'https://exchange.kuru.io/api/v3'

// Symbol config — needed to decode raw prices
interface SymbolInfo {
  symbol: string
  baseAsset: string
  quoteAsset: string
  marketAddress: string
  baseDecimals: number
  quoteDecimals: number
  sizePrecision: bigint
  pricePrecision: number
  takerFeeBps: number
}

let symbolCachePromise: Promise<SymbolInfo[]> | null = null
let symbolCacheTime = 0
const SYMBOL_CACHE_TTL = 5 * 60 * 1000  // 5 minutes

async function getSymbols(): Promise<SymbolInfo[]> {
  const now = Date.now()
  if (symbolCachePromise && (now - symbolCacheTime) < SYMBOL_CACHE_TTL) {
    return symbolCachePromise
  }
  symbolCachePromise = fetch(`${KURU_BASE}/exchangeInfo`)
    .then(r => r.json())
    .then((d: any) => {
      return (d.symbols as any[])
        .filter(s => s.status === 'TRADING' && s.marketAddress && s.sizePrecision)
        .map(s => ({
          symbol:          s.symbol,
          baseAsset:       s.baseAsset,
          quoteAsset:      s.quoteAsset,
          marketAddress:   s.marketAddress,
          baseDecimals:    s.baseAssetPrecision,
          quoteDecimals:   s.quoteAssetPrecision,
          sizePrecision:   BigInt(s.sizePrecision),
          pricePrecision:  s.pricePrecision,
          takerFeeBps:     s.takerFeeBps ?? 0,
        }))
    })
    .catch((err) => {
      symbolCachePromise = null  // clear on failure — prevents poison cache
      symbolCacheTime = 0
      throw err
    })
  symbolCacheTime = now
  return symbolCachePromise
}

/**
 * Converts Kuru raw price to human-readable quote amount.
 * Formula: raw / sizePrecision  (fixed 2026-04-20 — removed erroneous *10)
 *   MON_USDC: 30845e12 / 1e18 = 0.030845 USDC ✓
 */
function decodePrice(raw: string, sizePrecision: bigint): number {
  return Number(BigInt(raw)) / Number(sizePrecision)
}

/**
 * Converts Kuru raw size to human-readable base token amount.
 * Formula: raw * 10^quoteDecimals / sizePrecision  (verified empirically 2026-04-17)
 *   MON_USDC: raw * 1e6 / 1e18 = raw / 1e12 → 516389184750568 → 516.39 MON ✓
 */
function decodeSize(raw: string, sizePrecision: bigint, quoteDecimals: number): number {
  return Number(BigInt(raw)) * Math.pow(10, quoteDecimals) / Number(sizePrecision)
}

/**
 * Fetches the live token price from Kuru CLOB pools via the 24h ticker.
 *
 * @param token - Base asset symbol, e.g. `'MON'` or `'WBTC'`
 * @param quoteAsset - Preferred quote asset (default `'USDC'`); falls back to any available market
 * @returns A {@link TokenPrice} with `token`, `price`, `source`, and `timestamp`
 *
 * @example
 * ```typescript
 * const { price } = await getTokenPrice('MON')
 * // → { token: 'MON', price: 0.031, source: 'kuru', timestamp: 1234567890 }
 * ```
 *
 * @category DEX
 */
export async function getTokenPrice(token: string, quoteAsset = 'USDC'): Promise<TokenPrice> {
  const symbols = await getSymbols()
  const sym = symbols.find(s => s.baseAsset === token && s.quoteAsset === quoteAsset)
    || symbols.find(s => s.baseAsset === token)

  if (!sym) throw new Error(`getTokenPrice: no market found for ${token}`)

  const ticker = await fetch(`${KURU_BASE}/ticker/24hr?symbol=${sym.symbol}`).then(r => r.json())

  return {
    token,
    price: decodePrice(ticker.lastPrice, sym.sizePrecision),
    source: 'kuru',
    timestamp: Date.now(),
  }
}

/**
 * Returns all active Kuru liquidity pools with volume and fee data.
 *
 * Fetches both `exchangeInfo` and 24h ticker in parallel and merges the results.
 * Each pool includes the market address, token pair, 24h volume (in USD), and taker fee.
 *
 * @returns Array of {@link Pool} objects for every `TRADING` market on Kuru
 *
 * @example
 * ```typescript
 * const pools = await getKuruPools()
 * // → [{ protocol: 'kuru', address: '0x...', token0: 'MON', token1: 'USDC', fee: 0 }, ...]
 * ```
 *
 * @category DEX
 */
export async function getKuruPools(): Promise<Pool[]> {
  const [symbols, tickers] = await Promise.all([
    getSymbols(),
    fetch(`${KURU_BASE}/ticker/24hr`).then(r => r.json()),
  ])

  const tickerMap = new Map<string, any>()
  if (Array.isArray(tickers)) {
    tickers.forEach((t: any) => tickerMap.set(t.symbol, t))
  }

  return symbols.map(s => {
    const t = tickerMap.get(s.symbol)
    const priceDecoded = t ? decodePrice(t.lastPrice, s.sizePrecision) : undefined
    const volumeRaw = t ? decodeSize(t.volume, s.sizePrecision, s.quoteDecimals) : undefined

    return {
      protocol: 'kuru' as const,
      address: s.marketAddress,
      token0: s.baseAsset,
      token1: s.quoteAsset,
      volume24h: volumeRaw && priceDecoded ? volumeRaw * priceDecoded : undefined,
      fee: s.takerFeeBps / 10000,
    }
  })
}

/**
 * Returns the bid/ask order book ladder for a Kuru market symbol.
 *
 * Raw prices and sizes are decoded from Kuru's internal precision format
 * into human-readable floats using the symbol's `sizePrecision` and `quoteDecimals`.
 *
 * @param symbol - Market symbol in `BASE_QUOTE` format, e.g. `'MON_USDC'`
 * @param depth - Number of price levels to fetch per side (default `10`)
 * @returns An {@link Orderbook} with `bids`, `asks`, `spread`, `midPrice`, and `timestamp`
 *
 * @example
 * ```typescript
 * const ob = await getOrderbook('MON_USDC', 5)
 * // → { symbol: 'MON_USDC', bids: [[0.031, 500], ...], asks: [[0.032, 300], ...], spread: 0.001, midPrice: 0.0315, timestamp: ... }
 * ```
 *
 * @category DEX
 */
export async function getOrderbook(symbol: string, depth = 10): Promise<Orderbook> {
  const symbols = await getSymbols()
  const sym = symbols.find(s => s.symbol === symbol)
  if (!sym) throw new Error(`getOrderbook: unknown symbol ${symbol}`)

  const data = await fetch(`${KURU_BASE}/depth?symbol=${symbol}&limit=${depth}`).then(r => r.json())

  const bids: [number, number][] = (data.bids as string[][]).map(([p, s]) => [
    decodePrice(p, sym.sizePrecision),
    decodeSize(s, sym.sizePrecision, sym.quoteDecimals),
  ])
  const asks: [number, number][] = (data.asks as string[][]).map(([p, s]) => [
    decodePrice(p, sym.sizePrecision),
    decodeSize(s, sym.sizePrecision, sym.quoteDecimals),
  ])

  const bestBid = bids[0]?.[0] ?? 0
  const bestAsk = asks[0]?.[0] ?? 0

  return {
    symbol,
    bids,
    asks,
    spread: bestAsk - bestBid,
    midPrice: (bestBid + bestAsk) / 2,
    timestamp: Date.now(),
  }
}

/**
 * Simulates an exact-in swap on Kuru by walking the live order book.
 *
 * No transaction is submitted. The function fetches up to 50 levels of depth,
 * fills `amountIn` against resting orders, and returns the expected output,
 * effective price, and price impact. Works for both buy and sell directions.
 *
 * @param tokenIn - Input token symbol, e.g. `'USDC'`
 * @param tokenOut - Output token symbol, e.g. `'MON'`
 * @param amountIn - Exact input amount in human-readable units (e.g. `100` for 100 USDC)
 * @returns A {@link SwapSimulation} with `amountOut`, `priceImpact`, `slippage`, and `route`
 *
 * @example
 * ```typescript
 * const sim = await simulateKuruSwap('USDC', 'MON', 100)
 * // → { tokenIn: 'USDC', tokenOut: 'MON', amountIn: 100, amountOut: 3200, priceImpact: 0.002, route: 'kuru:MON_USDC' }
 * ```
 *
 * @category DEX
 */
export async function simulateKuruSwap(
  tokenIn: string,
  tokenOut: string,
  amountIn: number,
): Promise<SwapSimulation> {
  // Find market
  const symbols = await getSymbols()
  const symBuy  = symbols.find(s => s.baseAsset === tokenOut && s.quoteAsset === tokenIn)
  const symSell = symbols.find(s => s.baseAsset === tokenIn  && s.quoteAsset === tokenOut)
  const sym = symBuy || symSell
  if (!sym) throw new Error(`simulateKuruSwap: no market for ${tokenIn}/${tokenOut}`)

  const isBuying = !!symBuy  // buying tokenOut with tokenIn (quote)
  const symbol   = sym.symbol
  const depth    = await fetch(`${KURU_BASE}/depth?symbol=${symbol}&limit=50`).then(r => r.json())

  const levels: [number, number][] = isBuying
    ? (depth.asks as string[][]).map(([p, s]) => [decodePrice(p, sym.sizePrecision), decodeSize(s, sym.sizePrecision, sym.quoteDecimals)])
    : (depth.bids as string[][]).map(([p, s]) => [decodePrice(p, sym.sizePrecision), decodeSize(s, sym.sizePrecision, sym.quoteDecimals)])

  if (!depth.bids?.length || !depth.asks?.length) {
    throw new Error(`simulateKuruSwap: empty orderbook for ${symbol}`)
  }

  const midPrice = (() => {
    const bid = decodePrice(depth.bids[0][0], sym.sizePrecision)
    const ask = decodePrice(depth.asks[0][0], sym.sizePrecision)
    return (bid + ask) / 2
  })()

  // Walk the book
  let remaining = amountIn
  let totalOut  = 0

  for (const [price, size] of levels) {
    if (remaining <= 0) break
    const available = isBuying ? size * price : size   // in tokenIn units
    const filled    = Math.min(remaining, available)
    totalOut  += isBuying ? filled / price : filled * price
    remaining -= filled
  }

  const effectivePrice = totalOut > 0 ? amountIn / totalOut : midPrice
  const priceImpact    = Math.abs(effectivePrice - midPrice) / midPrice

  return {
    tokenIn,
    tokenOut,
    amountIn,
    amountOut: totalOut,
    priceImpact,
    slippage: priceImpact,
    route: `kuru:${symbol}`,
  }
}
