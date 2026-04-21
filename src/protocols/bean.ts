/**
 * @module Bean
 * @description Bean Exchange — DLMM (Dynamic Liquidity Market Maker) DEX on Monad,
 * modelled after LFJ / Trader Joe v2. Liquidity is packed into discrete price bins;
 * LPs earn fees only in the active bin, similar to concentrated liquidity but with
 * integer bin-step granularity.
 *
 * **TVL:** ~$3M
 * **Type:** DLMM DEX
 * **Docs:** https://docs.beanexchange.io
 *
 * Available functions:
 * - {@link getBeanPairCount} — total number of deployed LB pairs
 * - {@link getBeanPairs} — paginated list of pairs with reserves
 */

// ============================================================
// Rampart SDK — Bean Exchange on Monad
// DLMM (Dynamic Liquidity Market Maker) DEX — similar to LFJ/Trader Joe
// DLMM Factory: 0x8Bb9727Ca742C146563DccBAFb9308A234e1d242
// Router:       0x721aC9E688E6b86F48b08DB2ba2D4B7bBBd12665
// ============================================================

import { publicClient } from '../chain'
import { getToken } from './dex/tokens'

export const BEAN_ADDRESSES = {
  factory: '0x8Bb9727Ca742C146563DccBAFb9308A234e1d242' as `0x${string}`,
  router:  '0x721aC9E688E6b86F48b08DB2ba2D4B7bBBd12665' as `0x${string}`,
} as const

const FACTORY_ABI = [
  {
    name: 'getNumberOfLBPairs',
    type: 'function' as const,
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'getLBPairAtIndex',
    type: 'function' as const,
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ type: 'address' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'getLBPairInformation',
    type: 'function' as const,
    inputs: [
      { name: 'tokenX',  type: 'address' },
      { name: 'tokenY',  type: 'address' },
      { name: 'binStep', type: 'uint256' },
    ],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'binStep',        type: 'uint16' },
          { name: 'LBPair',         type: 'address' },
          { name: 'createdByOwner', type: 'bool' },
          { name: 'ignoredForRouting', type: 'bool' },
        ],
      },
    ],
    stateMutability: 'view' as const,
  },
] as const

const PAIR_ABI = [
  {
    name: 'getReserves',
    type: 'function' as const,
    inputs: [],
    outputs: [
      { name: 'reserveX', type: 'uint128' },
      { name: 'reserveY', type: 'uint128' },
    ],
    stateMutability: 'view' as const,
  },
  {
    name: 'getTokenX',
    type: 'function' as const,
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'getTokenY',
    type: 'function' as const,
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view' as const,
  },
] as const

export interface BeanPair {
  address:   string
  tokenX:    string
  tokenY:    string
  reserveX:  bigint
  reserveY:  bigint
  protocol:  string
}

/**
 * Returns the total number of Bean Exchange DLMM pairs deployed on Monad.
 *
 * Calls `Factory.getNumberOfLBPairs()`. Returns `0` on RPC failure.
 *
 * @returns Total pair count as a number.
 *
 * @example
 * ```typescript
 * const count = await getBeanPairCount()
 * // → 12
 * ```
 *
 * @category DEX
 */
export async function getBeanPairCount(): Promise<number> {
  const count = await publicClient.readContract({
    address: BEAN_ADDRESSES.factory,
    abi: FACTORY_ABI,
    functionName: 'getNumberOfLBPairs',
  }).catch(() => 0n)

  return Number(count)
}

/**
 * Returns Bean Exchange DLMM pairs with on-chain reserves.
 *
 * Fetches pair addresses from the factory by index (up to `maxPairs`), then
 * resolves `tokenX`, `tokenY`, and `getReserves` for each pair in parallel.
 *
 * @param maxPairs - Maximum number of pairs to fetch (default `20`).
 * @returns Array of {@link BeanPair} objects sorted by factory index.
 *
 * @example
 * ```typescript
 * const pairs = await getBeanPairs(5)
 * // → [{ address: '0x...', tokenX: '0x...', tokenY: '0x...', reserveX: 500000n, ... }]
 * ```
 *
 * @category DEX
 */
export async function getBeanPairs(maxPairs = 20): Promise<BeanPair[]> {
  const total = await getBeanPairCount()
  const limit = Math.min(total, maxPairs)

  const addresses = await Promise.all(
    Array.from({ length: limit }, (_, i) =>
      publicClient.readContract({
        address: BEAN_ADDRESSES.factory,
        abi: FACTORY_ABI,
        functionName: 'getLBPairAtIndex',
        args: [BigInt(i)],
      }).catch(() => null)
    )
  )

  const pairs = await Promise.all(
    addresses.filter(Boolean).map(async (addr) => {
      const pairAddr = addr as `0x${string}`
      const [tokenX, tokenY, reserves] = await Promise.all([
        publicClient.readContract({ address: pairAddr, abi: PAIR_ABI, functionName: 'getTokenX' }).catch(() => null),
        publicClient.readContract({ address: pairAddr, abi: PAIR_ABI, functionName: 'getTokenY' }).catch(() => null),
        publicClient.readContract({ address: pairAddr, abi: PAIR_ABI, functionName: 'getReserves' }).catch(() => null),
      ])

      if (!tokenX || !tokenY) return null

      return {
        address:   pairAddr,
        tokenX:    tokenX as string,
        tokenY:    tokenY as string,
        reserveX:  (reserves as any)?.[0] ?? 0n,
        reserveY:  (reserves as any)?.[1] ?? 0n,
        protocol:  'bean',
      } satisfies BeanPair
    })
  )

  return pairs.filter(Boolean) as BeanPair[]
}
