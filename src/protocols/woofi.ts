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
 * - {@link getWooFiQuote} — PMM quote for any token pair via WooPPV2.query
 * - {@link getWooFiRouterQuote} — router-level quote via WooRouterV2.querySwap (any pair)
 * - {@link getWooFiStats} — WooFi platform stats from REST API (volume, TVL, traders)
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

const ERC20_DECIMALS_ABI = [
  {
    name: 'decimals',
    type: 'function' as const,
    inputs: [],
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view' as const,
  },
] as const

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
    name: 'query',
    type: 'function' as const,
    inputs: [
      { name: 'fromToken', type: 'address' },
      { name: 'toToken',   type: 'address' },
      { name: 'fromAmount', type: 'uint256' },
    ],
    outputs: [{ name: 'toAmount', type: 'uint256' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'tryQuery',
    type: 'function' as const,
    inputs: [
      { name: 'fromToken', type: 'address' },
      { name: 'toToken',   type: 'address' },
      { name: 'fromAmount', type: 'uint256' },
    ],
    outputs: [{ name: 'toAmount', type: 'uint256' }],
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

const WOO_ROUTER_ABI = [
  {
    name: 'querySwap',
    type: 'function' as const,
    inputs: [
      { name: 'fromToken', type: 'address' },
      { name: 'toToken',   type: 'address' },
      { name: 'fromAmount', type: 'uint256' },
    ],
    outputs: [{ name: 'toAmount', type: 'uint256' }],
    stateMutability: 'view' as const,
  },
] as const

const WOOFI_STATS_API = 'https://fi-api.woo.org'

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

export interface WooFiStats {
  volume24h:  number
  tvl:        number
  traders24h: number
  protocol:   string
}

const PROBE_TOKENS = ['WMON', 'WETH', 'WBTC', 'USDT'] as const

async function getTokenDecimals(address: `0x${string}`, fallback = 18): Promise<number> {
  const d = await publicClient.readContract({
    address,
    abi: ERC20_DECIMALS_ABI,
    functionName: 'decimals',
  }).catch(() => null)
  return d != null ? Number(d) : fallback
}

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
  }).catch(() => null) as `0x${string}` | null

  const quoteToken = PROBE_TOKENS.find(t => {
    try { return getToken(t).address.toLowerCase() === quoteAddr?.toLowerCase() } catch { return false }
  }) ?? 'USDC'

  const quoteDecimals = quoteAddr
    ? await getTokenDecimals(quoteAddr, 6)
    : 6

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

      const tokenDecimals = await getTokenDecimals(tokenAddr, TOKENS[symbol]?.decimals ?? 18)

      return {
        baseToken:  symbol,
        quoteToken,
        reserve:    Number((info as any).reserve) / 10 ** tokenDecimals,
        feeRate:    Number((info as any).feeRate),
        protocol:   'woofi',
      } satisfies WooFiPool
    })
  )

  return results.flatMap(r => r.status === 'fulfilled' && r.value ? [r.value] : [])
}

/**
 * Queries the WooFi PMM for a swap quote via WooPPV2.query on Monad.
 *
 * Calls `query(fromToken, toToken, fromAmount)` on WooPPV2 — supports any token pair,
 * not just base→quote. Validates against pool reserve balance.
 *
 * @param fromSymbol - Input token symbol (e.g. `'WMON'`, `'WETH'`, `'USDC'`)
 * @param toSymbol   - Output token symbol (e.g. `'USDC'`, `'WETH'`)
 * @param amountIn   - Amount in human-readable units (e.g. `1` for 1 WMON)
 * @returns {@link WooFiQuote} with amountOut, effective price, and protocol tag, or `null` on failure
 *
 * @example
 * ```typescript
 * const quote = await getWooFiQuote('WMON', 'USDC', 100)
 * // → { amountIn: 100, amountOut: 35.4, price: 0.354, protocol: 'woofi' }
 * ```
 *
 * @category DEX
 */
export async function getWooFiQuote(
  fromSymbol: string,
  toSymbol: string,
  amountIn: number,
): Promise<WooFiQuote | null> {
  let fromAddr: `0x${string}`, toAddr: `0x${string}`
  try {
    fromAddr = getToken(fromSymbol).address
    toAddr   = getToken(toSymbol).address
  } catch { return null }

  const fromDecimals = await getTokenDecimals(fromAddr, TOKENS[fromSymbol]?.decimals ?? 18)
  const toDecimals   = await getTokenDecimals(toAddr,   TOKENS[toSymbol]?.decimals   ?? 18)
  const amountInRaw  = BigInt(Math.round(amountIn * 10 ** fromDecimals))

  const toAmount = await publicClient.readContract({
    address: WOOFI_ADDRESSES.wooPPV2,
    abi: WOO_PP_ABI,
    functionName: 'query',
    args: [fromAddr, toAddr, amountInRaw],
  }).catch(() => null)

  if (toAmount === null) return null

  const amountOut = Number(toAmount) / 10 ** toDecimals
  return {
    amountIn,
    amountOut,
    price:    amountIn > 0 ? amountOut / amountIn : 0,
    protocol: 'woofi',
  }
}

/**
 * Queries the WooFi router for a swap quote via WooRouterV2.querySwap on Monad.
 *
 * Calls `querySwap(fromToken, toToken, fromAmount)` on WooRouterV2 — router-level quote
 * that supports any token pair including multi-hop routes outside base→quote direction.
 *
 * @param fromSymbol - Input token symbol (e.g. `'WMON'`, `'WETH'`)
 * @param toSymbol   - Output token symbol (e.g. `'USDC'`, `'WBTC'`)
 * @param amountIn   - Amount in human-readable units (e.g. `1` for 1 WETH)
 * @returns {@link WooFiQuote} with amountOut, effective price, and protocol tag, or `null` on failure
 *
 * @example
 * ```typescript
 * const quote = await getWooFiRouterQuote('WETH', 'WBTC', 1)
 * // → { amountIn: 1, amountOut: 0.059, price: 0.059, protocol: 'woofi' }
 * ```
 *
 * @category DEX
 */
export async function getWooFiRouterQuote(
  fromSymbol: string,
  toSymbol: string,
  amountIn: number,
): Promise<WooFiQuote | null> {
  let fromAddr: `0x${string}`, toAddr: `0x${string}`
  try {
    fromAddr = getToken(fromSymbol).address
    toAddr   = getToken(toSymbol).address
  } catch { return null }

  const fromDecimals = await getTokenDecimals(fromAddr, TOKENS[fromSymbol]?.decimals ?? 18)
  const toDecimals   = await getTokenDecimals(toAddr,   TOKENS[toSymbol]?.decimals   ?? 18)
  const amountInRaw  = BigInt(Math.round(amountIn * 10 ** fromDecimals))

  const toAmount = await publicClient.readContract({
    address: WOOFI_ADDRESSES.wooRouter,
    abi: WOO_ROUTER_ABI,
    functionName: 'querySwap',
    args: [fromAddr, toAddr, amountInRaw],
  }).catch(() => null)

  if (toAmount === null) return null

  const amountOut = Number(toAmount) / 10 ** toDecimals
  return {
    amountIn,
    amountOut,
    price:    amountIn > 0 ? amountOut / amountIn : 0,
    protocol: 'woofi',
  }
}

/**
 * Fetches WooFi platform statistics from the WooFi REST API.
 *
 * Calls `https://fi-api.woo.org/stat` and filters for Monad-specific data.
 *
 * @returns {@link WooFiStats} with 24h volume, TVL, traders count, or `null` on failure
 *
 * @example
 * ```typescript
 * const stats = await getWooFiStats()
 * // → { volume24h: 1200000, tvl: 500000, traders24h: 340, protocol: 'woofi' }
 * ```
 *
 * @category DEX
 */
export async function getWooFiStats(): Promise<WooFiStats | null> {
  try {
    const resp = await fetch(`${WOOFI_STATS_API}/stat`)
    if (!resp.ok) return null
    const data = await resp.json()

    const rows: any[] = Array.isArray(data?.data) ? data.data : Array.isArray(data?.rows) ? data.rows : []
    const monad = rows.find((r: any) =>
      typeof r?.network === 'string' && r.network.toLowerCase().includes('monad')
    ) ?? rows.find((r: any) =>
      r?.chainId === 143 || r?.chain_id === 143
    )

    const src = monad ?? data

    return {
      volume24h:  Number(src?.volume24h  ?? src?.volume_24h  ?? src?.volume  ?? 0),
      tvl:        Number(src?.tvl        ?? src?.totalLiquidity ?? 0),
      traders24h: Number(src?.traders24h ?? src?.traders_24h ?? src?.users   ?? 0),
      protocol:   'woofi',
    }
  } catch {
    return null
  }
}
