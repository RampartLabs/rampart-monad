/**
 * @module Router
 * @description Rampart multi-DEX swap router — finds the best swap route across
 * Kuru, Uniswap V2/V3, PancakeSwap V2/V3, and OpenOcean in a single call.
 *
 * **Type:** Aggregator
 * **DEX Sources:** Kuru · Uniswap V2/V3 · PancakeSwap V2/V3 · OpenOcean
 *
 * Available functions:
 * - {@link getBestSwapRoute} — best swap route across all DEXes
 * - {@link getAllSwapQuotes} — all DEX quotes for a token pair
 * - {@link detectDexArbitrage} — detect cross-DEX price divergence
 */

// ============================================================
// Rampart SDK — Smart Swap Router (Multi-DEX Aggregator)
// Sources: Kuru, Uniswap V2/V3, PancakeSwap V2/V3
// ============================================================

import { getTokenPrice, simulateKuruSwap } from '../protocols/kuru'
import { getUniswapV2Quote, getPancakeV2Quote } from '../protocols/dex/uniswap-v2'
import { getUniswapV3Quote, getPancakeV3Quote } from '../protocols/dex/uniswap-v3'
import { getToken } from '../protocols/dex/tokens'
import { getOpenOceanQuote } from '../protocols/openocean'

export type DexName = 'kuru' | 'uniswap-v2' | 'uniswap-v3' | 'pancake-v2' | 'pancake-v3' | 'openocean'

export interface SwapRoute {
  dex:            DexName
  amountIn:       number
  amountOut:      number
  tokenIn:        string
  tokenOut:       string
  priceImpact:    number     // 0..1
  effectivePrice: number     // tokenOut per tokenIn
  fee?:           number     // fee tier (V3 only)
  isBest:         boolean
  warning?:       string     // e.g. stale price, low liquidity
}

export interface RouterResult {
  tokenIn:    string
  tokenOut:   string
  amountIn:   number
  best:       SwapRoute
  all:        SwapRoute[]
  savedVsBest: number       // USD saved vs worst route
}

/**
 * Returns the best swap route across all 6 DEX sources for an exact-input swap.
 *
 * Queries Kuru, Uniswap V2/V3, PancakeSwap V2/V3, and OpenOcean in parallel,
 * then ranks by amountOut. Adds a warning on routes that deviate >5% from Kuru's
 * reference price (thin/stale liquidity indicator).
 *
 * @param tokenIn - Input token symbol (e.g. `'WMON'`, `'USDC'`)
 * @param tokenOut - Output token symbol
 * @param amount - Exact input amount in human units (e.g. `100` for 100 USDC)
 * @returns {@link RouterResult} with best route, all routes, and estimated savings
 *
 * @example
 * ```typescript
 * const route = await getBestSwapRoute('WMON', 'USDC', 100)
 * console.log(`Best: ${route.best.dex} — ${route.best.amountOut} USDC`)
 * console.log(`Saved vs worst: $${route.savedVsBest.toFixed(2)}`)
 * ```
 *
 * @category Aggregator
 */
export async function getBestSwapRoute(
  tokenIn:  string,
  tokenOut: string,
  amount:   number,
): Promise<RouterResult> {
  const tIn  = getToken(tokenIn)
  const tOut = getToken(tokenOut)
  const amountInBigInt = BigInt(Math.floor(amount * 10 ** tIn.decimals))

  // Fetch reference price from Kuru for deviation check
  let kuruRefPrice = 0
  try {
    const p = await getTokenPrice(tokenIn)
    kuruRefPrice = p.price
  } catch { /* ok */ }

  // Run all DEX quotes in parallel
  const [kuruQuote, uniV2, uniV3, pancakeV2, pancakeV3, openOcean] = await Promise.allSettled([
    simulateKuruSwap(tokenIn, tokenOut, amount),
    getUniswapV2Quote(tokenIn, tokenOut, amountInBigInt),
    getUniswapV3Quote(tokenIn, tokenOut, amountInBigInt),
    getPancakeV2Quote(tokenIn, tokenOut, amountInBigInt),
    getPancakeV3Quote(tokenIn, tokenOut, amountInBigInt),
    getOpenOceanQuote(tokenIn, tokenOut, amount),
  ])

  const routes: SwapRoute[] = []

  // Kuru
  if (kuruQuote.status === 'fulfilled') {
    const q = kuruQuote.value
    routes.push({
      dex:            'kuru',
      amountIn:       amount,
      amountOut:      q.amountOut,
      tokenIn,
      tokenOut,
      priceImpact:    q.priceImpact,
      effectivePrice: q.amountOut / amount,
      isBest:         false,
    })
  }

  // Uniswap V2
  if (uniV2.status === 'fulfilled' && uniV2.value) {
    const q = uniV2.value
    const effPrice = q.amountOutHuman / amount
    const deviation = kuruRefPrice > 0 ? Math.abs(effPrice - kuruRefPrice) / kuruRefPrice : 0
    routes.push({
      dex:            'uniswap-v2',
      amountIn:       amount,
      amountOut:      q.amountOutHuman,
      tokenIn,
      tokenOut,
      priceImpact:    0, // V2 doesn't provide impact directly
      effectivePrice: effPrice,
      isBest:         false,
      warning:        deviation > 0.05 ? `Price deviates ${(deviation*100).toFixed(1)}% from Kuru reference` : undefined,
    })
  }

  // Uniswap V3
  if (uniV3.status === 'fulfilled' && uniV3.value) {
    const q = uniV3.value
    const effPrice = q.amountOutHuman / amount
    const deviation = kuruRefPrice > 0 ? Math.abs(effPrice - kuruRefPrice) / kuruRefPrice : 0
    routes.push({
      dex:            'uniswap-v3',
      amountIn:       amount,
      amountOut:      q.amountOutHuman,
      tokenIn,
      tokenOut,
      priceImpact:    0,
      effectivePrice: effPrice,
      fee:            q.fee,
      isBest:         false,
      warning:        deviation > 0.05 ? `Price deviates ${(deviation*100).toFixed(1)}% from Kuru reference` : undefined,
    })
  }

  // PancakeSwap V2
  if (pancakeV2.status === 'fulfilled' && pancakeV2.value) {
    const q = pancakeV2.value
    const effPrice = q.amountOutHuman / amount
    const deviation = kuruRefPrice > 0 ? Math.abs(effPrice - kuruRefPrice) / kuruRefPrice : 0
    routes.push({
      dex:            'pancake-v2',
      amountIn:       amount,
      amountOut:      q.amountOutHuman,
      tokenIn,
      tokenOut,
      priceImpact:    0,
      effectivePrice: effPrice,
      isBest:         false,
      warning:        deviation > 0.05 ? `Price deviates ${(deviation*100).toFixed(1)}% from Kuru reference` : undefined,
    })
  }

  // PancakeSwap V3
  if (pancakeV3.status === 'fulfilled' && pancakeV3.value) {
    const q = pancakeV3.value
    const effPrice = q.amountOutHuman / amount
    const deviation = kuruRefPrice > 0 ? Math.abs(effPrice - kuruRefPrice) / kuruRefPrice : 0
    routes.push({
      dex:            'pancake-v3',
      amountIn:       amount,
      amountOut:      q.amountOutHuman,
      tokenIn,
      tokenOut,
      priceImpact:    0,
      effectivePrice: effPrice,
      fee:            q.fee,
      isBest:         false,
      warning:        deviation > 0.05 ? `Price deviates ${(deviation*100).toFixed(1)}% from Kuru reference` : undefined,
    })
  }

  // OpenOcean
  if (openOcean.status === 'fulfilled' && openOcean.value.amountOut > 0) {
    const q = openOcean.value
    const effPrice = q.amountOut / amount
    const deviation = kuruRefPrice > 0 ? Math.abs(effPrice - kuruRefPrice) / kuruRefPrice : 0
    routes.push({
      dex:            'openocean',
      amountIn:       amount,
      amountOut:      q.amountOut,
      tokenIn,
      tokenOut,
      priceImpact:    0,
      effectivePrice: effPrice,
      isBest:         false,
      warning:        deviation > 0.05 ? `Price deviates ${(deviation*100).toFixed(1)}% from Kuru reference` : undefined,
    })
  }

  if (routes.length === 0) {
    throw new Error(`No swap route found for ${tokenIn}→${tokenOut}`)
  }

  // Sort by amountOut descending — best route first
  routes.sort((a, b) => b.amountOut - a.amountOut)
  routes[0].isBest = true

  const best = routes[0]
  const worst = routes[routes.length - 1]
  const savedVsBest = (best.amountOut - worst.amountOut) * (kuruRefPrice || 1)

  return { tokenIn, tokenOut, amountIn: amount, best, all: routes, savedVsBest }
}

/**
 * Returns all DEX quotes for a token pair without picking a best route.
 *
 * Equivalent to `getBestSwapRoute(...).all` — useful when you want to inspect
 * every quote independently or build custom routing logic.
 *
 * @param tokenIn - Input token symbol
 * @param tokenOut - Output token symbol
 * @param amount - Exact input amount in human units
 * @returns All {@link SwapRoute} objects from all queried DEXes
 *
 * @example
 * ```typescript
 * const quotes = await getAllSwapQuotes('WMON', 'USDC', 10)
 * quotes.forEach(q => console.log(`${q.dex}: ${q.amountOut} USDC`))
 * ```
 *
 * @category Aggregator
 */
export async function getAllSwapQuotes(
  tokenIn:  string,
  tokenOut: string,
  amount:   number,
): Promise<SwapRoute[]> {
  const result = await getBestSwapRoute(tokenIn, tokenOut, amount)
  return result.all
}

/**
 * Detects cross-DEX arbitrage opportunities for a token pair.
 *
 * Compares all DEX quotes and returns a result when the spread between
 * the best and worst price exceeds `minSpreadPct`. The `buy` field is the
 * DEX giving the most output (cheapest buy), `sell` is the least output
 * (highest sell price for the reverse leg).
 *
 * @param tokenIn - Input token symbol
 * @param tokenOut - Output token symbol
 * @param amount - Trade size in human units (default: 100)
 * @param minSpreadPct - Minimum spread % to report (default: 2)
 * @returns Arbitrage details or `null` if no opportunity found
 *
 * @example
 * ```typescript
 * const arb = await detectDexArbitrage('WMON', 'USDC', 1000, 1)
 * if (arb) console.log(`Buy on ${arb.buy}, sell on ${arb.sell} — ${arb.spreadPct.toFixed(2)}% spread`)
 * ```
 *
 * @category Aggregator
 */
export async function detectDexArbitrage(
  tokenIn:       string,
  tokenOut:      string,
  amount        = 100,
  minSpreadPct  = 2,
): Promise<{ buy: DexName; sell: DexName; spreadPct: number; estimatedProfit: number } | null> {
  const routes = await getAllSwapQuotes(tokenIn, tokenOut, amount)
  if (routes.length < 2) return null

  const best  = routes[0]   // already sorted descending
  const worst = routes[routes.length - 1]

  const spreadPct = ((best.amountOut - worst.amountOut) / worst.amountOut) * 100
  if (spreadPct < minSpreadPct) return null

  return {
    buy:             best.dex,    // buy on cheapest (most tokenOut per tokenIn)
    sell:            worst.dex,   // sell on most expensive (least tokenOut = highest price)
    spreadPct,
    estimatedProfit: best.amountOut - worst.amountOut,
  }
}
