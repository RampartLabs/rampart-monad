/**
 * Rampart SDK — Real-time Subscriptions Example
 *
 * Uses WebSocket (wss://rpc.monad.xyz) to stream live Monad events.
 * Run:  npx tsx examples/realtime.ts
 * Stop: Ctrl+C
 */

import { subscribeToSwaps, subscribeToStaking, subscribeToNewBlocks } from '../src/index'

async function main() {
  console.log('=== Rampart Real-time — Monad Mainnet ===')
  console.log('Streaming live events (Ctrl+C to stop)\n')

  // ── Block stream ───────────────────────────────────────────────
  let blockCount = 0
  const unsubBlocks = subscribeToNewBlocks((block) => {
    blockCount++
    if (blockCount <= 3 || blockCount % 10 === 0) {
      console.log(`[Block #${block.number}]  txs: ${block.transactions}  ts: ${new Date(block.timestamp * 1000).toISOString()}`)
    }
  })

  // ── Kuru swap stream ───────────────────────────────────────────
  const unsubSwaps = subscribeToSwaps((swap) => {
    const amtIn  = Number(swap.amountIn)  / 1e6   // USDC 6 dec
    const amtOut = Number(swap.amountOut) / 1e18  // MON  18 dec
    console.log(
      `[Swap]  ${swap.tokenIn}→${swap.tokenOut}` +
      `  block=${swap.blockNumber}` +
      `  tx=${swap.txHash.slice(0, 10)}…`
    )
  })

  // ── aPriori staking stream ─────────────────────────────────────
  const unsubStaking = subscribeToStaking((ev) => {
    const assets = Number(ev.assets) / 1e18
    console.log(
      `[${ev.type.toUpperCase()}]  user=${ev.user.slice(0, 10)}…  ` +
      `assets=${assets.toFixed(2)} MON  block=${ev.blockNumber}`
    )
  })

  // Run for 30 seconds then clean up
  await new Promise(resolve => setTimeout(resolve, 30_000))

  console.log('\nUnsubscribing…')
  unsubBlocks()
  unsubSwaps()
  unsubStaking()
  console.log('Done.')
}

main().catch(console.error)
