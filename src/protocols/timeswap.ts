/**
 * @module Timeswap
 * @description Timeswap — permissionless fixed-maturity options and lending on Monad.
 * Any token pair can be listed without oracles. Lenders provide liquidity to
 * fixed-duration pools; borrowers lock collateral and receive fixed-rate loans.
 * Two factory contracts manage options (token pairs) and pools (specific maturities).
 *
 * **TVL:** ~$500K
 * **Type:** Fixed-Maturity Options / Lending
 * **Docs:** https://docs.timeswap.io
 *
 * Available functions:
 * - {@link getTimeswapStats} — option pair count and pool count
 * - {@link isTimeswapAvailable} — liveness check for deployed contracts
 */

// ============================================================
// Rampart SDK — Timeswap on Monad
// Permissionless fixed-maturity options/lending with OptionFactory and PoolFactory.
// Source: github.com/monad-crypto/protocols/mainnet/timeswap.jsonc
// ============================================================

import { publicClient } from '../chain'

export const TIMESWAP_ADDRESSES = {
  OptionFactory: '0x9515507fC36174e0BAbac382B6640ef2325E61da' as `0x${string}`,
  PoolFactory:   '0xBf90d2d8E629cA48CF001F1CA6aDb47f120Fb91a' as `0x${string}`,
} as const

const FACTORY_ABI = [
  { name: 'numberOfPairs',  type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'get',            type: 'function' as const, inputs: [{ name: 'token0', type: 'address' }, { name: 'token1', type: 'address' }], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
] as const

const POOL_FACTORY_ABI = [
  { name: 'numberOfPools', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
] as const

export interface TimeswapStats {
  optionPairs:  number
  poolCount:    number
  protocol:     'timeswap'
}

/**
 * Returns Timeswap on-chain stats on Monad.
 *
 * Reads `OptionFactory.numberOfPairs` and `PoolFactory.numberOfPools` in parallel
 * via `Promise.allSettled`. Returns zeros gracefully on RPC failure.
 *
 * @returns {@link TimeswapStats} with `optionPairs`, `poolCount`, and `protocol: 'timeswap'`.
 *
 * @example
 * ```typescript
 * const stats = await getTimeswapStats()
 * // → { optionPairs: 5, poolCount: 12, protocol: 'timeswap' }
 * ```
 *
 * @category Lending
 */
export async function getTimeswapStats(): Promise<TimeswapStats> {
  const [optionPairsRaw, poolCountRaw] = await Promise.allSettled([
    publicClient.readContract({ address: TIMESWAP_ADDRESSES.OptionFactory, abi: FACTORY_ABI,      functionName: 'numberOfPairs' }),
    publicClient.readContract({ address: TIMESWAP_ADDRESSES.PoolFactory,   abi: POOL_FACTORY_ABI, functionName: 'numberOfPools' }),
  ])

  const optionPairs = optionPairsRaw.status === 'fulfilled' ? Number(optionPairsRaw.value as bigint) : 0
  const poolCount   = poolCountRaw.status   === 'fulfilled' ? Number(poolCountRaw.value   as bigint) : 0

  return { optionPairs, poolCount, protocol: 'timeswap' }
}

/**
 * Returns `true` if Timeswap contracts are deployed on Monad.
 *
 * Checks bytecode at {@link TIMESWAP_ADDRESSES.OptionFactory}. Returns `false`
 * on RPC error or empty bytecode.
 *
 * @returns `true` when bytecode is present, `false` otherwise.
 *
 * @example
 * ```typescript
 * const live = await isTimeswapAvailable()
 * // → true
 * ```
 *
 * @category Lending
 */
export async function isTimeswapAvailable(): Promise<boolean> {
  const code = await publicClient.getBytecode({ address: TIMESWAP_ADDRESSES.OptionFactory }).catch(() => null)
  return !!code && code !== '0x'
}
