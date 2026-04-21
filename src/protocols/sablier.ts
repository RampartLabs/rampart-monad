/**
 * @module Sablier
 * @description Sablier token streaming protocol on Monad. Enables real-time per-second
 * ERC-20 token disbursement for vesting schedules, payroll, grants, and subscriptions.
 * Uses the Lockup contract family (Linear / Dynamic / Tranched).
 *
 * **TVL:** N/A (streaming, not lending)
 * **Type:** Token Streaming
 * **Docs:** https://docs.sablier.com/guides/lockup/deployments
 *
 * Available functions:
 * - {@link getSablierStreamCount} — total streams ever created
 * - {@link getSablierStream} — details for a single stream by ID
 * - {@link getSablierStats} — aggregate stats (total + estimated active streams)
 */

// ============================================================
// Rampart SDK — Sablier Token Streaming on Monad
// Sablier enables real-time token streaming (vesting, payroll, etc.)
// Docs: https://docs.sablier.com/guides/lockup/deployments
// ============================================================

import { publicClient } from '../chain'

export const SABLIER_ADDRESSES = {
  lockup:      '0x82723C1ffEc9D43dE5FA80b25Da8df99AfD470ba' as `0x${string}`,
  batchLockup: '0x4FCACf614E456728CaEa87f475bd78EC3550E20B' as `0x${string}`,
} as const

const LOCKUP_ABI = [
  {
    name: 'nextStreamId',
    type: 'function' as const,
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'getStream',
    type: 'function' as const,
    inputs: [{ type: 'uint256', name: 'streamId' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'sender',       type: 'address' },
          { name: 'startTime',    type: 'uint40' },
          { name: 'endTime',      type: 'uint40' },
          { name: 'isCancelable', type: 'bool' },
          { name: 'wasCanceled',  type: 'bool' },
          { name: 'asset',        type: 'address' },
          { name: 'isDepleted',   type: 'bool' },
          { name: 'isStream',     type: 'bool' },
          { name: 'isTransferable', type: 'bool' },
          { name: 'amounts',      type: 'tuple', components: [
            { name: 'deposited', type: 'uint128' },
            { name: 'withdrawn', type: 'uint128' },
            { name: 'refunded',  type: 'uint128' },
          ]},
        ],
      },
    ],
    stateMutability: 'view' as const,
  },
] as const

export interface SablierStats {
  totalStreams:   number
  activeStreams:  number
  totalDeposited: number   // raw sum across recent streams (last N)
  protocol:       string
}

export interface SablierStream {
  id:           number
  sender:       string
  asset:        string
  deposited:    bigint
  withdrawn:    bigint
  refunded:     bigint
  startTime:    number
  endTime:      number
  isDepleted:   boolean
  wasCanceled:  boolean
}

/**
 * Returns the total number of Sablier streams ever created on Monad.
 *
 * Reads `Lockup.nextStreamId()`. Because stream IDs are 1-indexed, the
 * total count equals `nextStreamId - 1`.
 *
 * @returns Total streams created (integer).
 *
 * @example
 * ```typescript
 * const count = await getSablierStreamCount()
 * // → 247
 * ```
 *
 * @category Network
 */
export async function getSablierStreamCount(): Promise<number> {
  const nextId = await publicClient.readContract({
    address: SABLIER_ADDRESSES.lockup,
    abi: LOCKUP_ABI,
    functionName: 'nextStreamId',
  }).catch(() => 0n)

  return Number(nextId) - 1  // streams are 1-indexed
}

/**
 * Returns details for a specific Sablier stream by numeric ID.
 *
 * Calls `Lockup.getStream(streamId)` and maps the on-chain tuple to
 * a typed {@link SablierStream} object. Returns `null` if the stream
 * does not exist or the call reverts.
 *
 * @param streamId - 1-based stream identifier.
 * @returns {@link SablierStream} or `null` if not found.
 *
 * @example
 * ```typescript
 * const stream = await getSablierStream(1)
 * // → { id: 1, sender: '0x...', asset: '0x...', deposited: 1000000n, ... }
 * ```
 *
 * @category Network
 */
export async function getSablierStream(streamId: number): Promise<SablierStream | null> {
  try {
    const s = await publicClient.readContract({
      address: SABLIER_ADDRESSES.lockup,
      abi: LOCKUP_ABI,
      functionName: 'getStream',
      args: [BigInt(streamId)],
    })

    return {
      id:          streamId,
      sender:      (s as any).sender,
      asset:       (s as any).asset,
      deposited:   (s as any).amounts.deposited,
      withdrawn:   (s as any).amounts.withdrawn,
      refunded:    (s as any).amounts.refunded,
      startTime:   Number((s as any).startTime),
      endTime:     Number((s as any).endTime),
      isDepleted:  (s as any).isDepleted,
      wasCanceled: (s as any).wasCanceled,
    }
  } catch {
    return null
  }
}

/**
 * Returns aggregate Sablier stats for Monad.
 *
 * Samples the last 20 streams to estimate the ratio of active (not depleted
 * and not canceled) to total streams, then projects that ratio across all streams.
 * Also sums raw deposited amounts from the sample.
 *
 * @returns {@link SablierStats} with `totalStreams`, `activeStreams` (estimated),
 *   `totalDeposited` (raw sum from sample), and `protocol`.
 *
 * @example
 * ```typescript
 * const stats = await getSablierStats()
 * // → { totalStreams: 247, activeStreams: 180, totalDeposited: 5000000, protocol: 'sablier' }
 * ```
 *
 * @category Network
 */
export async function getSablierStats(): Promise<SablierStats> {
  const totalStreams = await getSablierStreamCount()

  // Sample last 20 streams to estimate active ratio
  const sampleSize = Math.min(20, totalStreams)
  const startId    = Math.max(1, totalStreams - sampleSize + 1)

  const streams = await Promise.all(
    Array.from({ length: sampleSize }, (_, i) => getSablierStream(startId + i))
  )

  const valid   = streams.filter(Boolean) as SablierStream[]
  const active  = valid.filter(s => !s.isDepleted && !s.wasCanceled)

  const activeRatio     = totalStreams > 0 ? active.length / valid.length : 0
  const estActiveTotal  = Math.round(totalStreams * activeRatio)
  const totalDeposited  = valid.reduce((sum, s) => sum + Number(s.deposited), 0)

  return {
    totalStreams,
    activeStreams:  estActiveTotal,
    totalDeposited,
    protocol:       'sablier',
  }
}
