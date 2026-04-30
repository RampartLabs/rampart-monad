/**
 * @module OpenOcean
 * @description OpenOcean DEX aggregator on Monad. Routes swaps across multiple
 * on-chain liquidity sources to find the best execution price. Exposes an
 * off-chain quote API (`open-api.openocean.finance/v4/monad`) backed by the
 * on-chain ExchangeProxy for settlement.
 *
 * **TVL:** N/A (aggregator)
 * **Type:** DEX Aggregator
 * **Docs:** https://docs.openocean.finance
 *
 * Available functions:
 * - {@link getOpenOceanQuote} — get a swap quote for a token pair and amount
 * - {@link getOpenOceanPrice} — mid-price for 1 unit of tokenIn
 * - {@link isOpenOceanAvailable} — check if the ExchangeProxy is deployed
 */

// ============================================================
// Rampart SDK — OpenOcean on Monad
// DEX aggregator with ExchangeProxy for optimal swap routing.
// Source: github.com/monad-crypto/protocols/mainnet/openocean.jsonc
// ============================================================

import { publicClient } from '../chain'
import { getToken } from './dex/tokens'

export const OPENOCEAN_ADDRESSES = {
  ExchangeProxy: '0x6352a56caadC4F1E25CD6c75970Fa768A3304e64' as `0x${string}`,
  ExchangeV2:    '0x6352a56caadC4F1E25CD6c75970Fa768A3304e64' as `0x${string}`,
} as const

const EXCHANGE_ABI = [
  { name: 'getChainId', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
] as const

const OPENOCEAN_API = 'https://open-api.openocean.finance/v4/monad'

export interface OpenOceanQuote {
  tokenIn:   string
  tokenOut:  string
  amountIn:  number
  amountOut: number
  price:     number
  gasEstimate: number
  protocol:  'openocean'
}

/**
 * Returns an OpenOcean swap quote for a given token pair and input amount.
 *
 * Resolves token addresses from the registry, converts `amountIn` to the
 * smallest unit, then queries `open-api.openocean.finance/v4/monad/quote`.
 * Returns zeros on any API or token-lookup failure.
 *
 * @param tokenIn  - Input token symbol (e.g. `'WMON'`).
 * @param tokenOut - Output token symbol (e.g. `'USDC'`).
 * @param amountIn - Human-readable input amount (e.g. `1` for 1 WMON).
 * @returns {@link OpenOceanQuote} with `amountOut`, `price`, `gasEstimate`, and `protocol`.
 *
 * @example
 * ```typescript
 * const quote = await getOpenOceanQuote('WMON', 'USDC', 10)
 * // → { tokenIn: 'WMON', tokenOut: 'USDC', amountIn: 10, amountOut: 3.54, price: 0.354, ... }
 * ```
 *
 * @category DEX
 */
export async function getOpenOceanQuote(
  tokenIn:  string,
  tokenOut: string,
  amountIn: number,
): Promise<OpenOceanQuote> {
  let inAddr: string, outAddr: string
  let inDecimals = 18, outDecimals = 18
  try {
    const tIn  = getToken(tokenIn)
    const tOut = getToken(tokenOut)
    inAddr     = tIn.address
    outAddr    = tOut.address
    inDecimals  = tIn.decimals  ?? 18
    outDecimals = tOut.decimals ?? 18
  } catch {
    return { tokenIn, tokenOut, amountIn, amountOut: 0, price: 0, gasEstimate: 0, protocol: 'openocean' }
  }

  // OpenOcean API takes amount in human-readable units (e.g. 100 for 100 USDC),
  // not in raw token units — it handles the decimal conversion internally
  const amountInRaw = amountIn.toString()

  try {
    const url = `${OPENOCEAN_API}/quote?inTokenAddress=${inAddr}&outTokenAddress=${outAddr}&amount=${amountInRaw}&gasPrice=50`
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data = await resp.json() as { data?: { outAmount?: string; estimatedGas?: number } }
    const outRaw = data.data?.outAmount ?? '0'
    const amountOut = Number(outRaw) / 10 ** outDecimals
    const price     = amountIn > 0 ? amountOut / amountIn : 0
    return {
      tokenIn, tokenOut, amountIn, amountOut, price,
      gasEstimate: data.data?.estimatedGas ?? 0,
      protocol: 'openocean',
    }
  } catch {
    return { tokenIn, tokenOut, amountIn, amountOut: 0, price: 0, gasEstimate: 0, protocol: 'openocean' }
  }
}

/**
 * Returns the OpenOcean mid-price for 1 unit of `tokenIn` denominated in `tokenOut`.
 *
 * Convenience wrapper around {@link getOpenOceanQuote} with `amountIn = 1`.
 *
 * @param tokenIn  - Input token symbol (e.g. `'WMON'`).
 * @param tokenOut - Output token symbol (e.g. `'USDC'`).
 * @returns Price as a float (units of `tokenOut` per 1 `tokenIn`). `0` on failure.
 *
 * @example
 * ```typescript
 * const price = await getOpenOceanPrice('WMON', 'USDC')
 * // → 0.354
 * ```
 *
 * @category DEX
 */
export async function getOpenOceanPrice(tokenIn: string, tokenOut: string): Promise<number> {
  const quote = await getOpenOceanQuote(tokenIn, tokenOut, 1)
  return quote.price
}

/**
 * Returns `true` if the OpenOcean ExchangeProxy contract is deployed on Monad.
 *
 * Checks bytecode at {@link OPENOCEAN_ADDRESSES.ExchangeProxy}. Useful as a
 * liveness guard before attempting quote or swap calls.
 *
 * @returns `true` when bytecode is present, `false` otherwise.
 *
 * @example
 * ```typescript
 * const live = await isOpenOceanAvailable()
 * // → true
 * ```
 *
 * @category DEX
 */
export async function isOpenOceanAvailable(): Promise<boolean> {
  const code = await publicClient.getBytecode({ address: OPENOCEAN_ADDRESSES.ExchangeProxy }).catch(() => null)
  return !!code && code !== '0x'
}
