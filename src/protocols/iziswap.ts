/**
 * @module iZiSwap
 * @description iZiSwap Discretized Liquidity AMM on Monad. Concentrates liquidity
 * at discrete price points (integer "points") rather than continuous ranges, enabling
 * efficient on-chain limit orders alongside standard LP positions.
 *
 * **TVL:** ~$2M
 * **Type:** Concentrated Liquidity DEX
 * **Docs:** https://izumi.finance/docs
 *
 * Available functions:
 * - {@link getIZiPools} — probe active pools across known pairs and fee tiers
 * - {@link getIZiStats} — pool count and active-pool summary
 */

// ============================================================
// Rampart SDK — iZiSwap on Monad
// Concentrated liquidity DEX (Discretized Liquidity AMM)
// Factory: 0x8c7d3063579BdB0b90997e18A770eaE32E1eBb08
// Swap:    0x34bc1b87f60e0a30c0e24FD7Abada70436c71406
// LiqMgr:  0x19b683A2F45012318d9B2aE1280d68d3eC54D663
// ============================================================

import { publicClient } from '../chain'
import { getToken } from './dex/tokens'

export const IZISWAP_ADDRESSES = {
  factory:      '0x8c7d3063579BdB0b90997e18A770eaE32E1eBb08' as `0x${string}`,
  swapRouter:   '0x34bc1b87f60e0a30c0e24FD7Abada70436c71406' as `0x${string}`,
  liquidityMgr: '0x19b683A2F45012318d9B2aE1280d68d3eC54D663' as `0x${string}`,
} as const

const FACTORY_ABI = [
  {
    name: 'getPool',
    type: 'function' as const,
    inputs: [
      { name: 'tokenX',   type: 'address' },
      { name: 'tokenY',   type: 'address' },
      { name: 'fee',      type: 'uint24' },
    ],
    outputs: [{ type: 'address' }],
    stateMutability: 'view' as const,
  },
] as const

const POOL_ABI = [
  {
    name: 'state',
    type: 'function' as const,
    inputs: [],
    outputs: [
      { name: 'sqrtPrice_96', type: 'uint160' },
      { name: 'currentPoint', type: 'int24' },
      { name: 'observationCurrentIndex', type: 'uint16' },
      { name: 'observationQueueLen', type: 'uint16' },
      { name: 'observationNextQueueLen', type: 'uint16' },
      { name: 'locked', type: 'bool' },
      { name: 'liquidity', type: 'uint128' },
      { name: 'liquidityX', type: 'uint128' },
    ],
    stateMutability: 'view' as const,
  },
] as const

export interface IZiPool {
  tokenX:   string
  tokenY:   string
  fee:      number
  address:  string
  liquidity: bigint
  protocol: string
}

const FEE_TIERS = [400, 2000, 10000] as const  // 0.04%, 0.2%, 1%
const SEED_PAIRS: [string, string][] = [
  ['WMON', 'USDC'],
  ['WMON', 'USDT'],
  ['WMON', 'WETH'],
  ['WETH', 'USDC'],
  ['WBTC', 'USDC'],
]

/**
 * Returns active iZiSwap pools on Monad by probing known token pairs and fee tiers.
 *
 * Iterates over {@link SEED_PAIRS} × `[400, 2000, 10000]` fee tiers, calls
 * `Factory.getPool`, then reads `Pool.state` for liquidity.
 *
 * @returns Array of {@link IZiPool} objects (may be empty if no pools exist yet).
 *
 * @example
 * ```typescript
 * const pools = await getIZiPools()
 * // → [{ tokenX: 'WMON', tokenY: 'USDC', fee: 400, liquidity: 1234n, ... }]
 * ```
 *
 * @category DEX
 */
export async function getIZiPools(): Promise<IZiPool[]> {
  const results: IZiPool[] = []

  for (const [symX, symY] of SEED_PAIRS) {
    let addrX: `0x${string}`, addrY: `0x${string}`
    try { addrX = getToken(symX).address; addrY = getToken(symY).address } catch { continue }

    for (const fee of FEE_TIERS) {
      const poolAddr = await publicClient.readContract({
        address: IZISWAP_ADDRESSES.factory,
        abi: FACTORY_ABI,
        functionName: 'getPool',
        args: [addrX, addrY, fee],
      }).catch(() => null) as `0x${string}` | null

      if (!poolAddr || poolAddr === '0x0000000000000000000000000000000000000000') continue

      const state = await publicClient.readContract({
        address: poolAddr,
        abi: POOL_ABI,
        functionName: 'state',
      }).catch(() => null) as any

      results.push({
        tokenX:    symX,
        tokenY:    symY,
        fee,
        address:   poolAddr,
        liquidity: state?.liquidity ?? 0n,
        protocol:  'iziswap',
      })
    }
  }

  return results
}

/**
 * Returns iZiSwap pool count and active-pool summary for Monad.
 *
 * Calls {@link getIZiPools} and counts pools with `liquidity > 0`.
 *
 * @returns Object with `pools` (total found), `activePools` (liquidity > 0), and `protocol`.
 *
 * @example
 * ```typescript
 * const stats = await getIZiStats()
 * // → { pools: 6, activePools: 4, protocol: 'iziswap' }
 * ```
 *
 * @category DEX
 */
export async function getIZiStats(): Promise<{ pools: number; activePools: number; protocol: string }> {
  const pools = await getIZiPools()
  return {
    pools:       pools.length,
    activePools: pools.filter(p => p.liquidity > 0n).length,
    protocol:    'iziswap',
  }
}
