/**
 * @module Purps
 * @description Purps — perpetuals DEX on Monad with a Factory/Router architecture.
 * Each market is an independent vault contract; traders interact through the Router
 * while the Factory maintains a registry of all active markets.
 *
 * **TVL:** ~$2M
 * **Type:** Perpetuals DEX
 * **Docs:** https://docs.purps.xyz
 *
 * Available functions:
 * - {@link getPurpsMarkets} — list perpetual markets with TVL
 * - {@link getPurpsTVL} — aggregate TVL across all markets
 */

// ============================================================
// Rampart SDK — Purps on Monad
// Perp DEX with Factory and Router contracts on Monad.
// Source: github.com/monad-crypto/protocols/mainnet/purps.jsonc
// ============================================================

import { publicClient } from '../chain'

export const PURPS_ADDRESSES = {
  Factory: '0xAfE4d3eB898591ACe6285176b26f0F5BEb894447' as `0x${string}`,
  Router:  '0x22aDf91b491abc7a50895Cd5c5c194EcCC93f5E2' as `0x${string}`,
} as const

const FACTORY_ABI = [
  { name: 'allMarketsLength', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'allMarkets',       type: 'function' as const, inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
  { name: 'getMarket',        type: 'function' as const, inputs: [{ type: 'address' }], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
] as const

const MARKET_ABI = [
  { name: 'totalSupply', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'totalAssets', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'name',        type: 'function' as const, inputs: [], outputs: [{ type: 'string' }],  stateMutability: 'view' as const },
] as const

export interface PurpsMarket {
  address:     string
  name:        string
  totalAssets: number
  tvlUSD:      number
  protocol:    'purps'
}

/**
 * Returns Purps perpetual markets on Monad with name and TVL.
 *
 * Reads `Factory.allMarketsLength()`, then fetches each market address by index
 * and resolves `name` and `totalAssets` (USDC 6-decimal normalised) in parallel.
 * Skips markets that revert on any call.
 *
 * @param maxMarkets - Maximum number of markets to fetch (default `10`).
 * @returns Array of {@link PurpsMarket} objects.
 *
 * @example
 * ```typescript
 * const markets = await getPurpsMarkets()
 * // → [{ address: '0x...', name: 'MON-PERP', totalAssets: 800000, tvlUSD: 800000, ... }]
 * ```
 *
 * @category Perps
 */
export async function getPurpsMarkets(maxMarkets = 10): Promise<PurpsMarket[]> {
  const countRaw = await publicClient.readContract({
    address: PURPS_ADDRESSES.Factory,
    abi: FACTORY_ABI,
    functionName: 'allMarketsLength',
  }).catch(() => null)

  if (countRaw === null) return []
  const n = Math.min(Number(countRaw as bigint), maxMarkets)

  const addrs = await Promise.allSettled(
    Array.from({ length: n }, (_, i) =>
      publicClient.readContract({ address: PURPS_ADDRESSES.Factory, abi: FACTORY_ABI, functionName: 'allMarkets', args: [BigInt(i)] })
    )
  )

  const marketAddrs = addrs.flatMap(r => r.status === 'fulfilled' ? [r.value as `0x${string}`] : [])

  const results = await Promise.allSettled(
    marketAddrs.map(async (addr) => {
      const [nameRaw, assetsRaw] = await Promise.allSettled([
        publicClient.readContract({ address: addr, abi: MARKET_ABI, functionName: 'name' }),
        publicClient.readContract({ address: addr, abi: MARKET_ABI, functionName: 'totalAssets' }),
      ])
      const name        = nameRaw.status   === 'fulfilled' ? (nameRaw.value as string) : addr.slice(0, 10)
      const totalAssets = assetsRaw.status === 'fulfilled' ? Number(assetsRaw.value as bigint) / 1e6 : 0
      return { address: addr, name, totalAssets, tvlUSD: totalAssets, protocol: 'purps' as const }
    })
  )

  return results.flatMap(r => r.status === 'fulfilled' ? [r.value as PurpsMarket] : [])
}

/**
 * Returns total Purps TVL on Monad in USD.
 *
 * Calls {@link getPurpsMarkets} and sums `tvlUSD` across all markets.
 *
 * @returns Total TVL as a float (USD).
 *
 * @example
 * ```typescript
 * const tvl = await getPurpsTVL()
 * // → 2000000
 * ```
 *
 * @category Perps
 */
export async function getPurpsTVL(): Promise<number> {
  const markets = await getPurpsMarkets()
  return markets.reduce((s, m) => s + m.tvlUSD, 0)
}
