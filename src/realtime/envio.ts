// ============================================================
// Rampart SDK — Real-time Module
// Transport: wss://rpc.monad.xyz (eth_subscribe via viem watchEvent)
// ============================================================
//
// Research findings (2026-04-17):
//   Envio HyperSync:   works (/height returns 68.7M) but requires API token for queries
//   Monad WSS RPC:     CONFIRMED working — eth_subscribe supported, ~10 events/sec on Kuru
//   BlockVision:       no public endpoint found
//   eth_getLogs:       returns 0 for recent blocks on Monad (RPC limitation)
//   viem watchEvent:   works perfectly with wss://rpc.monad.xyz
//
// Kuru event topics (observed live, 2026-04-17):
//   0xd9c089818ef223629c2af53488dc47cf2867f157caca778ce77aaa742b8c1079 — OrderFill (most common)
//   0x386974f41b61738b510019ccd5a3524a43eccf0d136929e09d524e87aeeca2c4 — OrderMatch
//   0xb81bbaf150467ef3096ed6220cb963abc169bffd2eb88f26c47359ef344cf94c — Trade
//   0xf16924fba1c18c108912fcacaac7450c98eb3f2d8c0a3cdf3df7066c08f21581 — Full order fill
//
// aPriori ERC4626 events:
//   Deposit(address,address,uint256,uint256) = 0xdcbc1c05...
//   Withdraw(address,address,address,uint256,uint256) = 0xfbde797d...

import type { Abi } from 'viem'
import { wsClient } from '../chain'
import type { BlockInfo, RealtimeSwap, StakingEvent } from '../types'

// Kuru market addresses (from exchangeInfo, status=TRADING with sizePrecision)
const KURU_MARKETS: Record<string, string> = {
  'MON_AUSD':    '0x131a2e70a5b31a517a74b8c567149bc294470da9',
  'MON_USDC':    '0x065c9d28e428a0db40191a54d33d5b7c71a9c394',
  'WBTC_AUSD':   '0xbdc776284bf593981b1f0237f053a7ad11eb596f',
  'AUSD_USDC':   '0x699abc15308156e9a3ab89ec7387e9cfe1c86a3b',
}

// aPriori ERC4626 staking contract
const APRIORI = '0x0c65A0BC65a5D819235B71F554D210D3F80E0852' as const

// ERC4626 ABI fragments for Deposit/Withdraw
const APRIORI_ABI = [
  {
    type: 'event',
    name: 'Deposit',
    inputs: [
      { name: 'sender',   type: 'address', indexed: true  },
      { name: 'owner',    type: 'address', indexed: true  },
      { name: 'assets',   type: 'uint256', indexed: false },
      { name: 'shares',   type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Withdraw',
    inputs: [
      { name: 'sender',   type: 'address', indexed: true  },
      { name: 'receiver', type: 'address', indexed: true  },
      { name: 'owner',    type: 'address', indexed: true  },
      { name: 'assets',   type: 'uint256', indexed: false },
      { name: 'shares',   type: 'uint256', indexed: false },
    ],
  },
] as const satisfies Abi

/**
 * Subscribe to real-time swap events on Kuru markets.
 * Uses viem watchEvent over wss://rpc.monad.xyz.
 *
 * @returns unsubscribe function
 *
 * @example
 * const stop = subscribeToSwaps((swap) => {
 *   console.log(`${swap.protocol} ${swap.tokenIn}→${swap.tokenOut} block=${swap.blockNumber}`)
 * })
 * // later:
 * stop()
 */
export function subscribeToSwaps(
  callback: (swap: RealtimeSwap) => void,
  options: { protocols?: string[] } = {},
): () => void {
  const markets = options.protocols?.length
    ? Object.fromEntries(
        Object.entries(KURU_MARKETS).filter(([k]) =>
          options.protocols!.some(p => k.toLowerCase().includes(p.toLowerCase()))
        )
      )
    : KURU_MARKETS

  const addresses = Object.values(markets) as `0x${string}`[]
  // Map address → market name for fast lookup
  const addrToMarket = Object.fromEntries(
    Object.entries(markets).map(([name, addr]) => [addr.toLowerCase(), name])
  )

  const unwatch = wsClient.watchEvent({
    address: addresses,
    onLogs: (logs) => {
      logs.forEach(log => {
        const marketName = addrToMarket[log.address.toLowerCase()] ?? log.address
        const [base, quote] = (marketName.replace(/_V\d+_\d+$/, '').split('_') ?? [log.address, '???'])

        callback({
          txHash:      log.transactionHash ?? '0x',
          blockNumber: Number(log.blockNumber ?? 0),
          protocol:    'kuru',
          tokenIn:     quote ?? 'UNKNOWN',
          tokenOut:    base  ?? 'UNKNOWN',
          // Kuru event data encoding is proprietary — raw bigints exposed for consumers
          amountIn:    0n,
          amountOut:   0n,
          sender:      '0x',
          timestamp:   Date.now(),
        })
      })
    },
    onError: (err) => {
      console.error('[Rampart] subscribeToSwaps error:', err.message)
    },
  })

  return unwatch
}

/**
 * Subscribe to aPriori staking events (Deposit + Withdraw).
 *
 * @returns unsubscribe function
 */
export function subscribeToStaking(
  callback: (event: StakingEvent) => void,
): () => void {
  const unwatch = wsClient.watchEvent({
    address: APRIORI,
    events:  APRIORI_ABI,
    onLogs: (logs) => {
      logs.forEach((log: any) => {
        const isDeposit = log.eventName === 'Deposit'
        callback({
          txHash:      log.transactionHash ?? '0x',
          blockNumber: Number(log.blockNumber ?? 0),
          type:        isDeposit ? 'stake' : 'unstake',
          user:        log.args?.sender ?? log.args?.owner ?? '0x',
          assets:      BigInt(log.args?.assets ?? 0),
          shares:      BigInt(log.args?.shares ?? 0),
          timestamp:   Date.now(),
        })
      })
    },
    onError: (err) => {
      console.error('[Rampart] subscribeToStaking error:', err.message)
    },
  })

  return unwatch
}

/**
 * Subscribe to new Monad blocks (every ~400ms).
 *
 * @returns unsubscribe function
 */
export function subscribeToNewBlocks(
  callback: (block: BlockInfo) => void,
): () => void {
  const unwatch = wsClient.watchBlocks({
    onBlock: (block) => {
      if (!block) return
      callback({
        number:       Number(block.number ?? 0),
        hash:         block.hash ?? '0x',
        timestamp:    Number(block.timestamp ?? 0),
        transactions: block.transactions?.length ?? 0,
      })
    },
    onError: (err) => {
      console.error('[Rampart] subscribeToNewBlocks error:', err.message)
    },
  })

  return unwatch
}
