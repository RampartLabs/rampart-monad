/**
 * @module WooFi
 * @description WooFi PMM (Proactive Market Maker) DEX on Monad.
 * Uses oracle-backed pricing via WooPPV2 with a single quote token (USDC) and
 * multiple base tokens. Provides direct on-chain price queries without simulation.
 *
 * **TVL:** ~$500K
 * **Type:** PMM DEX
 * **Docs:** https://woo.org
 *
 * Available functions:
 * - {@link getWooFiPools} — pool reserve and fee data for all supported base tokens
 * - {@link getWooFiQuote} — PMM sell quote: quoteToken received for a given baseToken amount
 */

// ============================================================
// Rampart SDK — WooFi DEX on Monad
// WooFi uses a custom PMM (Proactive Market Maker) with oracle-backed pricing.
// WooPPV2: 0x5520385bFcf07Ec87C4c53A7d8d65595Dff69FA4
// WooRouter: 0x4c4AF8DBc524681930a27b2F1Af5bcC8062E6fB7
// Docs: https://learn.woo.org/dev-docs/references/readme/monad
// ============================================================

import { publicClient } from '../chain'
import { getToken, TOKENS } from './dex/tokens'

export const WOOFI_ADDRESSES = {
  wooPPV2:   '0x5520385bFcf07Ec87C4c53A7d8d65595Dff69FA4' as `0x${string}`,
  wooRouter: '0x4c4AF8DBc524681930a27b2F1Af5bcC8062E6fB7' as `0x${string}`,
} as const

const WOO_PP_ABI = [
  {
    name: 'tokenInfos',
    type: 'function' as const,
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'reserve', type: 'uint192' },
          { name: 'feeRate', type: 'uint16' },
        ],
      },
    ],
    stateMutability: 'view' as const,
  },
  {
    name: 'querySellBase',
    type: 'function' as const,
    inputs: [
      { name: 'baseToken',   type: 'address' },
      { name: 'baseAmount',  type: 'uint256' },
    ],
    outputs: [{ name: 'quoteAmount', type: 'uint256' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'querySellQuote',
    type: 'function' as const,
    inputs: [
      { name: 'baseToken',    type: 'address' },
      { name: 'quoteAmount',  type: 'uint256' },
    ],
    outputs: [{ name: 'baseAmount', type: 'uint256' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'quoteToken',
    type: 'function' as const,
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view' as const,
  },
] as const

export interface WooFiPool {
  baseToken:  string
  quoteToken: string
  reserve:    number
  feeRate:    number
  protocol:   string
}

export interface WooFiQuote {
  amountIn:    number
  amountOut:   number
  price:       number
  protocol:    string
}

const PROBE_TOKENS = ['WMON', 'WETH', 'WBTC', 'USDT'] as const

/**
 * Returns WooFi pool reserve and fee data for all supported base tokens on Monad.
 *
 * Reads `tokenInfos` from WooPPV2 for each probed base token (WMON, WETH, WBTC, USDT).
 * Pools with zero reserve are excluded.
 *
 * @returns Array of {@link WooFiPool} objects with baseToken, quoteToken, reserve, and feeRate
 *
 * @example
 * ```typescript
 * const pools = await getWooFiPools()
 * // → [{ baseToken: 'WMON', quoteToken: 'USDC', reserve: 142000, feeRate: 25, ... }, ...]
 * ```
 *
 * @category DEX
 */
export async function getWooFiPools(): Promise<WooFiPool[]> {
  const quoteAddr = await publicClient.readContract({
    address: WOOFI_ADDRESSES.wooPPV2,
    abi: WOO_PP_ABI,
    functionName: 'quoteToken',
  }).catch(() => null)

  const quoteToken = PROBE_TOKENS.find(t => {
    try { return getToken(t).address.toLowerCase() === (quoteAddr as string)?.toLowerCase() } catch { return false }
  }) ?? 'USDC'

  const results = await Promise.allSettled(
    PROBE_TOKENS.map(async symbol => {
      let tokenAddr: `0x${string}`
      try { tokenAddr = getToken(symbol).address } catch { return null }

      const info = await publicClient.readContract({
        address: WOOFI_ADDRESSES.wooPPV2,
        abi: WOO_PP_ABI,
        functionName: 'tokenInfos',
        args: [tokenAddr],
      }).catch(() => null)

      if (!info || (info as any).reserve === 0n) return null

      return {
        baseToken:  symbol,
        quoteToken,
        reserve:    Number((info as any).reserve) / 1e18,
        feeRate:    Number((info as any).feeRate),
        protocol:   'woofi',
      } satisfies WooFiPool
    })
  )

  return results.flatMap(r => r.status === 'fulfilled' && r.value ? [r.value] : [])
}

/**
 * Queries the WooFi PMM for a sell-base quote on Monad.
 *
 * Calls `querySellBase` on WooPPV2 to determine how many USDC (quoteToken) you receive
 * for selling `amountIn` units of the given base token.
 *
 * @param baseSymbol - Base token symbol to sell (e.g. `'WMON'`, `'WETH'`, `'WBTC'`)
 * @param amountIn   - Amount of base token in human-readable units (e.g. `1` for 1 WMON)
 * @returns {@link WooFiQuote} with amountOut, effective price, and protocol tag, or `null` on failure
 *
 * @example
 * ```typescript
 * const quote = await getWooFiQuote('WMON', 100)
 * // → { amountIn: 100, amountOut: 35.4, price: 0.354, protocol: 'woofi' }
 * ```
 *
 * @category DEX
 */
export async function getWooFiQuote(
  baseSymbol: string,
  amountIn: number,
): Promise<WooFiQuote | null> {
  let baseAddr: `0x${string}`
  try { baseAddr = getToken(baseSymbol).address } catch { return null }

  const decimals = TOKENS[baseSymbol]?.decimals ?? 18
  const amountInRaw = BigInt(Math.round(amountIn * 10 ** decimals))

  const quoteAmount = await publicClient.readContract({
    address: WOOFI_ADDRESSES.wooPPV2,
    abi: WOO_PP_ABI,
    functionName: 'querySellBase',
    args: [baseAddr, amountInRaw],
  }).catch(() => null)

  if (quoteAmount === null) return null

  const amountOut = Number(quoteAmount) / 1e6  // USDC = 6 decimals
  return {
    amountIn,
    amountOut,
    price:    amountOut / amountIn,
    protocol: 'woofi',
  }
}

/**
 * Queries the WooFi PMM for a sell-quote (reverse) quote on Monad.
 *
 * Calls `querySellQuote` on WooPPV2 — you sell USDC (quoteToken) and receive a base token.
 * This is the reverse direction of {@link getWooFiQuote}.
 *
 * @param baseSymbol  - Base token you want to receive (e.g. `'WMON'`, `'WETH'`)
 * @param quoteAmount - Amount of USDC to sell (human-readable, e.g. `100` = 100 USDC)
 * @returns {@link WooFiQuote} with amountOut in base token units, or `null` on failure
 *
 * @example
 * ```typescript
 * const quote = await getWooFiQuoteReverse('WMON', 100)
 * // → { amountIn: 100, amountOut: 282.5, price: 0.354, protocol: 'woofi' }
 * ```
 *
 * @category DEX
 */
export async function getWooFiQuoteReverse(
  baseSymbol: string,
  quoteAmount: number,
): Promise<WooFiQuote | null> {
  let baseAddr: `0x${string}`
  try { baseAddr = getToken(baseSymbol).address } catch { return null }

  const quoteAmountRaw = BigInt(Math.round(quoteAmount * 1e6))  // USDC = 6 decimals

  const baseAmount = await publicClient.readContract({
    address: WOOFI_ADDRESSES.wooPPV2,
    abi: WOO_PP_ABI,
    functionName: 'querySellQuote',
    args: [baseAddr, quoteAmountRaw],
  }).catch(() => null)

  if (baseAmount === null) return null

  const baseDecimals = TOKENS[baseSymbol]?.decimals ?? 18
  const amountOut = Number(baseAmount) / 10 ** baseDecimals
  return {
    amountIn:  quoteAmount,
    amountOut,
    price:     amountOut > 0 ? quoteAmount / amountOut : 0,
    protocol:  'woofi',
  }
}
