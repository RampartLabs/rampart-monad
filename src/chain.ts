// ============================================================
// Rampart SDK — Monad Chain Configuration
// Uses viem's built-in monad chain (chainId: 143)
// ============================================================

import { createPublicClient, http, webSocket } from 'viem'
import { monad } from 'viem/chains'

export { monad }

// Primary public client (HTTP)
export const publicClient = createPublicClient({
  chain: monad,
  transport: http('https://rpc.monad.xyz', {
    timeout: 10_000,
    retryCount: 3,
    retryDelay: 500,
  }),
  batch: {
    multicall: {
      batchSize: 1024,
      wait: 16, // ~1 block
    },
  },
})

// WebSocket client for real-time subscriptions
// Double-cast needed: viem inferred type references RpcResponse which can't be named in .d.ts
export const wsClient = createPublicClient({
  chain: monad,
  transport: webSocket('wss://rpc.monad.xyz'),
}) as unknown as typeof publicClient

// Multicall3 address (confirmed in viem/chains)
export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11' as const

// Chain constants
export const MONAD_CHAIN_ID = 143
export const MONAD_BLOCK_TIME_MS = 400
export const MONAD_BLOCKS_PER_YEAR = (365 * 24 * 60 * 60 * 1000) / MONAD_BLOCK_TIME_MS
// = 78,840,000 blocks/year
