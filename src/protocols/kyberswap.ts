/**
 * @module KyberSwap
 * @description KyberSwap DEX aggregator on Monad.
 * Routes swaps across all on-chain DEXes via the KyberSwap Aggregator REST API
 * (`aggregator-api.kyberswap.com/monad`). Also supports direct USDC price lookups.
 *
 * **TVL:** N/A (aggregator)
 * **Type:** DEX Aggregator
 * **Docs:** https://docs.kyberswap.com
 *
 * Available functions:
 * - {@link getKyberSwapQuote} — best aggregated route and quote across all DEXes
 * - {@link getKyberSwapPrice} — USDC price of any token via the aggregator
 */

// ============================================================
// Rampart SDK — KyberSwap on Monad
// DEX aggregator + concentrated liquidity AMM (KyberSwap Elastic)
// Router: 0x6131B5fae19EA4f9D964eAc0408E4408b66337b5
// KyberSwap API: https://aggregator-api.kyberswap.com/monad/api/v1/
// ============================================================

import { publicClient } from '../chain'
import { getToken } from './dex/tokens'

export const KYBERSWAP_ADDRESSES = {
  router:        '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5' as `0x${string}`,
  dsloProxy:     '0xcab2FA2eeab7065B45CBcF6E3936dDE2506b4f6C' as `0x${string}`,
} as const

const KYBERSWAP_API = 'https://aggregator-api.kyberswap.com'

export interface KyberSwapRoute {
  amountIn:    string
  amountOut:   string
  gas:         string
  routeSummary: any
}

export interface KyberSwapQuote {
  amountIn:    number
  amountOut:   number
  price:       number
  priceImpact: number
  gas:         number
  protocol:    string
}

/**
 * Returns an aggregated swap quote from KyberSwap for the best route across all DEXes on Monad.
 *
 * Calls the KyberSwap Aggregator REST API to find the optimal multi-hop route.
 * Native MON is represented as `0xEeee...EEeE`.
 *
 * @param tokenIn  - Input token symbol (e.g. `'MON'`, `'WMON'`, `'WETH'`)
 * @param tokenOut - Output token symbol (e.g. `'USDC'`, `'WMON'`)
 * @param amountIn - Amount in human-readable units (e.g. `1` for 1 WMON)
 * @returns {@link KyberSwapQuote} with amountOut, price, priceImpact, and gas estimate, or `null` on failure
 *
 * @example
 * ```typescript
 * const quote = await getKyberSwapQuote('WMON', 'USDC', 10)
 * // → { amountIn: 10, amountOut: 3.54, price: 0.354, priceImpact: -0.001, gas: 150000, protocol: 'kyberswap' }
 * ```
 *
 * @category DEX
 */
export async function getKyberSwapQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: number,
): Promise<KyberSwapQuote | null> {
  let inAddr: string, outAddr: string
  try {
    inAddr  = tokenIn  === 'MON' ? '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' : getToken(tokenIn).address
    outAddr = tokenOut === 'MON' ? '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' : getToken(tokenOut).address
  } catch { return null }

  const inDecimals  = tokenIn  === 'MON' ? 18 : (getToken(tokenIn).decimals  ?? 18)
  const outDecimals = tokenOut === 'MON' ? 18 : (getToken(tokenOut).decimals ?? 18)
  const amountInRaw = (BigInt(Math.round(amountIn)) * BigInt(10 ** inDecimals)).toString()

  try {
    const url = `${KYBERSWAP_API}/monad/api/v1/routes?tokenIn=${inAddr}&tokenOut=${outAddr}&amountIn=${amountInRaw}&saveGas=0&gasInclude=1`
    const resp = await fetch(url, { headers: { 'x-client-id': 'rampart-sdk' } })
    if (!resp.ok) return null

    const data = await resp.json()
    const route: KyberSwapRoute = data?.data?.routeSummary
    if (!route) return null

    const amountOut = Number(route.amountOut) / 10 ** outDecimals
    return {
      amountIn,
      amountOut,
      price:       amountOut / amountIn,
      priceImpact: data?.data?.routeSummary?.priceImpact ?? 0,
      gas:         Number(route.gas),
      protocol:    'kyberswap',
    }
  } catch {
    return null
  }
}

/**
 * Returns the USDC price of a token via the KyberSwap aggregator on Monad.
 *
 * Convenience wrapper around {@link getKyberSwapQuote} that quotes 1 unit of the given
 * token against USDC and returns the effective price.
 *
 * @param symbol - Token symbol to price (e.g. `'MON'`, `'WMON'`, `'WETH'`)
 * @returns Price in USDC per 1 token unit, or `null` if the quote failed
 *
 * @example
 * ```typescript
 * const price = await getKyberSwapPrice('WMON')
 * // → 0.354
 * ```
 *
 * @category DEX
 */
export async function getKyberSwapPrice(symbol: string): Promise<number | null> {
  const quote = await getKyberSwapQuote(symbol === 'MON' ? 'MON' : symbol, 'USDC', 1)
  return quote ? quote.price : null
}
