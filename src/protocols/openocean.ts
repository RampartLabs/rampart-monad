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
 * - {@link buildOpenOceanSwap} — encoded tx data for executing a swap on-chain
 * - {@link getOpenOceanGasPrice} — current gas prices (standard/fast/instant) from OpenOcean
 * - {@link getOpenOceanTokens} — full token list supported by OpenOcean on Monad
 */

// ============================================================
// Rampart SDK — OpenOcean on Monad
// DEX aggregator with ExchangeProxy for optimal swap routing.
// ExchangeProxy (= ExchangeV2): 0x6352a56caadC4F1E25CD6c75970Fa768A3304e64
// Both ExchangeProxy and ExchangeV2 point to the same contract — confirmed via
// live swap API response (the 'to' field returns this address).
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

export interface OpenOceanSwapTx {
  to:           string
  data:         string
  value:        string
  estimatedGas: number
  minOutAmount: string
  protocol:     'openocean'
}

export interface OpenOceanGasPrice {
  standard: number
  fast:     number
  instant:  number
}

export interface OpenOceanToken {
  id:       number
  symbol:   string
  name:     string
  address:  string
  decimals: number
  usd:      string
  chain:    string
}

async function fetchGasPriceStandard(): Promise<number> {
  try {
    const resp = await fetch(`${OPENOCEAN_API}/gasPrice`)
    if (!resp.ok) return 50
    const data = await resp.json()
    return Number(data?.without_decimals?.standard ?? data?.data?.without_decimals?.standard ?? 50)
  } catch {
    return 50
  }
}

/**
 * Returns an OpenOcean swap quote for a given token pair and input amount.
 *
 * Resolves token addresses from the registry, converts `amountIn` to the
 * smallest unit, then queries `open-api.openocean.finance/v4/monad/quote`.
 * Gas price is fetched dynamically from OpenOcean's gasPrice endpoint.
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
  let outDecimals = 18
  try {
    const tIn  = getToken(tokenIn)
    const tOut = getToken(tokenOut)
    inAddr      = tIn.address
    outAddr     = tOut.address
    outDecimals = tOut.decimals ?? 18
  } catch {
    return { tokenIn, tokenOut, amountIn, amountOut: 0, price: 0, gasEstimate: 0, protocol: 'openocean' }
  }

  const gasPrice = await fetchGasPriceStandard()

  try {
    const url = `${OPENOCEAN_API}/quote?inTokenAddress=${inAddr}&outTokenAddress=${outAddr}&amount=${amountIn}&gasPrice=${gasPrice}`
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

/**
 * Fetches encoded transaction data for executing a swap via OpenOcean on Monad.
 *
 * Calls `GET /v4/monad/swap` which returns a fully built transaction (to, data, value)
 * ready for signing. Gas price is fetched dynamically from OpenOcean's gasPrice endpoint.
 *
 * @param tokenIn    - Input token symbol (e.g. `'WMON'`).
 * @param tokenOut   - Output token symbol (e.g. `'USDC'`).
 * @param amountIn   - Human-readable input amount (e.g. `10` for 10 WMON).
 * @param slippageBps - Slippage tolerance in basis points (e.g. `50` = 0.5%).
 * @param account    - Sender address (used for slippage and min-out calculation).
 * @returns {@link OpenOceanSwapTx} with `to`, `data`, `value`, `estimatedGas`, or `null` on failure.
 *
 * @example
 * ```typescript
 * const tx = await buildOpenOceanSwap('WMON', 'USDC', 10, 50, '0xYourAddress')
 * // → { to: '0x6352...', data: '0x...', value: '0', estimatedGas: 260000, ... }
 * ```
 *
 * @category DEX
 */
export async function buildOpenOceanSwap(
  tokenIn:    string,
  tokenOut:   string,
  amountIn:   number,
  slippageBps: number,
  account:    string,
): Promise<OpenOceanSwapTx | null> {
  let inAddr: string, outAddr: string
  try {
    inAddr  = getToken(tokenIn).address
    outAddr = getToken(tokenOut).address
  } catch { return null }

  const slippage = slippageBps / 100

  const gasPrice = await fetchGasPriceStandard()

  try {
    const url = `${OPENOCEAN_API}/swap?inTokenAddress=${inAddr}&outTokenAddress=${outAddr}&amount=${amountIn}&gasPrice=${gasPrice}&slippage=${slippage}&account=${account}`
    const resp = await fetch(url)
    if (!resp.ok) return null
    const data = await resp.json() as {
      data?: {
        to?:           string
        data?:         string
        value?:        string
        estimatedGas?: number
        minOutAmount?: string
      }
    }
    const d = data?.data
    if (!d?.to || !d?.data) return null

    return {
      to:           d.to,
      data:         d.data,
      value:        d.value ?? '0',
      estimatedGas: d.estimatedGas ?? 0,
      minOutAmount: d.minOutAmount ?? '0',
      protocol:     'openocean',
    }
  } catch {
    return null
  }
}

/**
 * Fetches current gas prices from OpenOcean on Monad.
 *
 * Returns standard, fast, and instant gas prices (in Gwei, without decimals).
 *
 * @returns {@link OpenOceanGasPrice} with standard/fast/instant values, or `null` on failure.
 *
 * @example
 * ```typescript
 * const gas = await getOpenOceanGasPrice()
 * // → { standard: 102, fast: 102, instant: 102 }
 * ```
 *
 * @category DEX
 */
export async function getOpenOceanGasPrice(): Promise<OpenOceanGasPrice | null> {
  try {
    const resp = await fetch(`${OPENOCEAN_API}/gasPrice`)
    if (!resp.ok) return null
    const data = await resp.json()
    const src = data?.without_decimals ?? data?.data?.without_decimals
    if (!src) return null
    return {
      standard: Number(src.standard),
      fast:     Number(src.fast),
      instant:  Number(src.instant),
    }
  } catch {
    return null
  }
}

/**
 * Fetches the full list of tokens supported by OpenOcean on Monad.
 *
 * Calls `GET /v4/monad/tokenList`.
 *
 * @returns Array of {@link OpenOceanToken} objects, or `[]` on failure.
 *
 * @example
 * ```typescript
 * const tokens = await getOpenOceanTokens()
 * // → [{ symbol: 'MON', address: '0x000...', decimals: 18, usd: '0.029', ... }, ...]
 * ```
 *
 * @category DEX
 */
export async function getOpenOceanTokens(): Promise<OpenOceanToken[]> {
  try {
    const resp = await fetch(`${OPENOCEAN_API}/tokenList`)
    if (!resp.ok) return []
    const data = await resp.json() as { data?: any[] }
    if (!Array.isArray(data?.data)) return []
    return data.data.map((t: any) => ({
      id:       t.id,
      symbol:   t.symbol,
      name:     t.name,
      address:  t.address,
      decimals: t.decimals,
      usd:      t.usd ?? '0',
      chain:    t.chain ?? 'monad',
    }))
  } catch {
    return []
  }
}
