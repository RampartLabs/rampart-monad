/**
 * @module Skate
 * @description Skate Finance — cross-chain intent execution infrastructure on Monad.
 * Users submit intents to the ActionBox; executors fulfill them across chains via the
 * SkateGateway message layer. Enables chain-abstracted DeFi interactions.
 *
 * **TVL:** N/A (intent execution layer)
 * **Type:** Cross-Chain Intents
 * **Docs:** https://docs.skatechain.org
 *
 * Available functions:
 * - {@link getSkateStats} — task count and gateway message count
 * - {@link isSkateAvailable} — liveness check for deployed contracts
 */

// ============================================================
// Rampart SDK — Skate Finance on Monad
// Cross-chain intent execution via ActionBox and SkateGateway.
// Source: github.com/monad-crypto/protocols/mainnet/skate.jsonc
// ============================================================

import { publicClient } from '../chain'

export const SKATE_ADDRESSES = {
  ActionBox:    '0x430b6E7f7D43D70786267AF7a5B2C1831372ca24' as `0x${string}`,
  SkateGateway: '0x79e31A114E6D2F16E1E2A3EC47C82FAc520881a4' as `0x${string}`,
} as const

const ACTION_BOX_ABI = [
  { name: 'taskCount',   type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'getTask',     type: 'function' as const, inputs: [{ type: 'uint256' }], outputs: [{ type: 'bytes32' }], stateMutability: 'view' as const },
] as const

const GATEWAY_ABI = [
  { name: 'messageCount', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
] as const

export interface SkateStats {
  taskCount:    number
  messageCount: number
  protocol:     'skate'
}

/**
 * Returns Skate Finance on-chain stats on Monad.
 *
 * Reads `ActionBox.taskCount` and `SkateGateway.messageCount` in parallel
 * via `Promise.allSettled`. Returns zeros gracefully on RPC failure.
 *
 * @returns {@link SkateStats} with `taskCount`, `messageCount`, and `protocol: 'skate'`.
 *
 * @example
 * ```typescript
 * const stats = await getSkateStats()
 * // → { taskCount: 310, messageCount: 85, protocol: 'skate' }
 * ```
 *
 * @category Network
 */
export async function getSkateStats(): Promise<SkateStats> {
  const [taskCountRaw, messageCountRaw] = await Promise.allSettled([
    publicClient.readContract({ address: SKATE_ADDRESSES.ActionBox,    abi: ACTION_BOX_ABI, functionName: 'taskCount' }),
    publicClient.readContract({ address: SKATE_ADDRESSES.SkateGateway, abi: GATEWAY_ABI,    functionName: 'messageCount' }),
  ])

  const taskCount    = taskCountRaw.status    === 'fulfilled' ? Number(taskCountRaw.value    as bigint) : 0
  const messageCount = messageCountRaw.status === 'fulfilled' ? Number(messageCountRaw.value as bigint) : 0

  return { taskCount, messageCount, protocol: 'skate' }
}

/**
 * Returns `true` if Skate Finance contracts are deployed on Monad.
 *
 * Checks bytecode at {@link SKATE_ADDRESSES.ActionBox}. Returns `false` on
 * RPC error or empty bytecode.
 *
 * @returns `true` when bytecode is present, `false` otherwise.
 *
 * @example
 * ```typescript
 * const live = await isSkateAvailable()
 * // → true
 * ```
 *
 * @category Network
 */
export async function isSkateAvailable(): Promise<boolean> {
  const code = await publicClient.getBytecode({ address: SKATE_ADDRESSES.ActionBox }).catch(() => null)
  return !!code && code !== '0x'
}
