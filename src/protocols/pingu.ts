/**
 * @module Pingu
 * @description Pingu Exchange — concentrated liquidity DEX on Monad with a
 * GMX v2-style DataStore architecture. Positions, orders, and market configs are
 * stored in a centralised DataStore contract queried via `bytes32` keys.
 *
 * **TVL:** ~$500K
 * **Type:** Concentrated Liquidity DEX
 * **Docs:** https://docs.pingu.exchange
 *
 * Available functions:
 * - {@link getPinguStats} — on-chain position count
 * - {@link isPinguAvailable} — liveness check for deployed contracts
 */

// ============================================================
// Rampart SDK — Pingu Exchange on Monad
// Concentrated liquidity DEX with DataStore and Positions management.
// Source: github.com/monad-crypto/protocols/mainnet/pingu.jsonc
// ============================================================

import { publicClient } from '../chain'

export const PINGU_ADDRESSES = {
  DataStore:   '0x631c6E0d5ae2E1F6a39871a9BE97F1D9d43D1C83' as `0x${string}`,
  Positions:   '0x3d7ec93875B6a6f0A5102fE29f887ee6E751b12F' as `0x${string}`,
  Router:      '0x5B16E11Cc86f38E4a2b79A93B34eD77F70EeA2e5' as `0x${string}`,
  EventEmitter:'0x5E48472d49f17fE6a9f00c87Bc4d7B60d8b5b93a' as `0x${string}`,
} as const

const DATASTORE_ABI = [
  { name: 'getUint',            type: 'function' as const, inputs: [{ name: 'key', type: 'bytes32' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'getBytes32Count',    type: 'function' as const, inputs: [{ name: 'setKey', type: 'bytes32' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'getBytes32ValuesAt', type: 'function' as const, inputs: [{ name: 'setKey', type: 'bytes32' }, { name: 'start', type: 'uint256' }, { name: 'end', type: 'uint256' }], outputs: [{ type: 'bytes32[]' }], stateMutability: 'view' as const },
  { name: 'getAddress',         type: 'function' as const, inputs: [{ name: 'key', type: 'bytes32' }], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
] as const

const POSITIONS_ABI = [
  { name: 'getPositionCount', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
] as const

// keccak256("MARKET_LIST") — GMX-style DataStore set key for market enumeration
const MARKET_LIST_KEY = '0x361dc8c9a3dffc3de91e3fb1b3b02e78c2af47ff07dee7b87a7a60e0e2cbfef4' as `0x${string}`

export interface PinguStats {
  positionCount: number
  marketCount:   number
  marketKeys:    string[]   // bytes32 keys of known markets
  protocol:      'pingu'
}

/**
 * Returns Pingu Exchange stats from on-chain contracts.
 *
 * Reads `Positions.getPositionCount()`. Uses `Promise.allSettled` so a
 * contract revert returns `0` gracefully.
 *
 * @returns {@link PinguStats} with `positionCount` and `protocol: 'pingu'`.
 *
 * @example
 * ```typescript
 * const stats = await getPinguStats()
 * // → { positionCount: 42, protocol: 'pingu' }
 * ```
 *
 * @category DEX
 */
export async function getPinguStats(): Promise<PinguStats> {
  const [positionCountRaw, marketCountRaw] = await Promise.allSettled([
    publicClient.readContract({ address: PINGU_ADDRESSES.Positions, abi: POSITIONS_ABI, functionName: 'getPositionCount' }),
    publicClient.readContract({ address: PINGU_ADDRESSES.DataStore,  abi: DATASTORE_ABI, functionName: 'getBytes32Count', args: [MARKET_LIST_KEY] }),
  ])

  const positionCount = positionCountRaw.status === 'fulfilled' ? Number(positionCountRaw.value as bigint) : 0
  const marketCount   = marketCountRaw.status   === 'fulfilled' ? Number(marketCountRaw.value   as bigint) : 0

  let marketKeys: string[] = []
  if (marketCount > 0) {
    const keysRaw = await publicClient.readContract({
      address: PINGU_ADDRESSES.DataStore,
      abi: DATASTORE_ABI,
      functionName: 'getBytes32ValuesAt',
      args: [MARKET_LIST_KEY, 0n, BigInt(marketCount)],
    }).catch(() => null)
    if (keysRaw) marketKeys = (keysRaw as string[])
  }

  return { positionCount, marketCount, marketKeys, protocol: 'pingu' }
}

/**
 * Returns `true` if Pingu Exchange contracts are deployed on Monad.
 *
 * Checks bytecode at {@link PINGU_ADDRESSES.DataStore}. Returns `false` on
 * RPC error or empty bytecode.
 *
 * @returns `true` when bytecode is present, `false` otherwise.
 *
 * @example
 * ```typescript
 * const live = await isPinguAvailable()
 * // → true
 * ```
 *
 * @category DEX
 */
export async function isPinguAvailable(): Promise<boolean> {
  const code = await publicClient.getBytecode({ address: PINGU_ADDRESSES.DataStore }).catch(() => null)
  return !!code && code !== '0x'
}
