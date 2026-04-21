/**
 * @module Doppler
 * @description Doppler — token launchpad on Monad powered by Uniswap V4 hooks.
 * Tokens are launched through the Airlock contract which emits `TokenCreated`
 * events; price discovery is handled by a custom V4 hook that enforces a fair
 * Dutch-auction style curve at launch. The TokenFactory tracks total launches.
 *
 * **TVL:** N/A (launchpad)
 * **Type:** V4 Token Launchpad
 * **Docs:** https://docs.doppler.finance
 *
 * Available functions:
 * - {@link getDopplerStats} — total tokens launched (factory count or event log fallback)
 * - {@link isDopplerAvailable} — liveness check for deployed contracts
 */

// ============================================================
// Rampart SDK — Doppler on Monad
// Token launchpad using Uniswap V4 hooks for fair price discovery.
// Source: github.com/monad-crypto/protocols/mainnet/doppler.jsonc
// ============================================================

import { publicClient } from '../chain'

export const DOPPLER_ADDRESSES = {
  TokenFactory: '0xaa47d2977d622dbdfd33eef6a8276727c52eb4e5' as `0x${string}`,
  V4Hook:       '0x580ca49389d83b019d07e17e99454f2f218e2dc0' as `0x${string}`,
  Airlock:      '0x660eAaEdEBc968f8f3694354FA8EC0b4c5Ba8D12' as `0x${string}`,
} as const

const TOKEN_FACTORY_ABI = [
  { name: 'tokenCount', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
] as const

const AIRLOCK_ABI = [
  {
    name: 'TokenCreated',
    type: 'event' as const,
    inputs: [
      { name: 'token',   type: 'address', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
    ],
  },
] as const

export interface DopplerStats {
  tokenCount: number
  protocol:   'doppler'
}

/**
 * Returns Doppler launchpad stats on Monad.
 *
 * Primary path: reads `TokenFactory.tokenCount()`. Fallback: counts
 * `Airlock.TokenCreated` events over the last 500,000 blocks (~55 hours).
 * The fallback is used when `tokenCount` reverts (e.g. different ABI).
 *
 * @returns {@link DopplerStats} with `tokenCount` and `protocol: 'doppler'`.
 *
 * @example
 * ```typescript
 * const stats = await getDopplerStats()
 * // → { tokenCount: 73, protocol: 'doppler' }
 * ```
 *
 * @category Network
 */
export async function getDopplerStats(): Promise<DopplerStats> {
  // Try TokenFactory.tokenCount first
  const countRaw = await publicClient.readContract({
    address: DOPPLER_ADDRESSES.TokenFactory,
    abi: TOKEN_FACTORY_ABI,
    functionName: 'tokenCount',
  }).catch(() => null)

  if (countRaw !== null) {
    return { tokenCount: Number(countRaw as bigint), protocol: 'doppler' }
  }

  // Fallback: count TokenCreated events from Airlock
  const blockNow  = await publicClient.getBlockNumber().catch(() => 0n)
  const fromBlock = blockNow > 500_000n ? blockNow - 500_000n : 0n
  const logs      = await publicClient.getLogs({
    address: DOPPLER_ADDRESSES.Airlock,
    event:   AIRLOCK_ABI[0],
    fromBlock,
    toBlock: blockNow,
  }).catch(() => [])

  return { tokenCount: logs.length, protocol: 'doppler' }
}

/**
 * Returns `true` if Doppler contracts are deployed on Monad.
 *
 * Checks bytecode at {@link DOPPLER_ADDRESSES.TokenFactory}. Returns `false`
 * on RPC error or empty bytecode.
 *
 * @returns `true` when bytecode is present, `false` otherwise.
 *
 * @example
 * ```typescript
 * const live = await isDopplerAvailable()
 * // → true
 * ```
 *
 * @category Network
 */
export async function isDopplerAvailable(): Promise<boolean> {
  const code = await publicClient.getBytecode({ address: DOPPLER_ADDRESSES.TokenFactory }).catch(() => null)
  return !!code && code !== '0x'
}
