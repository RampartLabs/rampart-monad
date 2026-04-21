import { describe, it, expect } from 'vitest'
import { subscribeToSwaps, subscribeToNewBlocks, subscribeToStaking } from '../src/realtime/envio'

describe('Real-time (WebSocket)', () => {
  it('subscribeToNewBlocks receives blocks within 3 seconds', async () => {
    const blocks: number[] = []

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('No blocks received in 3s')), 3000)

      const unwatch = subscribeToNewBlocks((block) => {
        blocks.push(block.number)
        if (blocks.length >= 2) {
          clearTimeout(timer)
          unwatch()
          resolve()
        }
      })
    })

    expect(blocks.length).toBeGreaterThanOrEqual(2)
    expect(blocks[0]).toBeGreaterThan(60_000_000)
    // blocks should be sequential
    expect(blocks[1]).toBeGreaterThanOrEqual(blocks[0])
    console.log(`  Received blocks: ${blocks.slice(0, 3).join(', ')} (Monad ~400ms/block)`)
  })

  it('subscribeToSwaps receives Kuru trades within 5 seconds', async () => {
    const swaps: string[] = []

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('No swaps received in 5s')), 5000)

      const unwatch = subscribeToSwaps((swap) => {
        swaps.push(`${swap.tokenIn}→${swap.tokenOut}@${swap.blockNumber}`)
        if (swaps.length >= 3) {
          clearTimeout(timer)
          unwatch()
          resolve()
        }
      })
    })

    expect(swaps.length).toBeGreaterThanOrEqual(3)
    console.log(`  Swaps: ${swaps.slice(0, 3).join(', ')}`)
  })

  it('unsubscribe stops receiving events', async () => {
    const events: number[] = []

    const unwatch = subscribeToNewBlocks((block) => {
      events.push(block.number)
    })

    // Wait for 1 block
    await new Promise(r => setTimeout(r, 600))
    const countBefore = events.length

    unwatch() // stop

    const countAfterUnsub = events.length
    await new Promise(r => setTimeout(r, 800))
    const countAfterWait = events.length

    // After unsub no new events should arrive
    expect(countAfterWait).toBe(countAfterUnsub)
    console.log(`  Events before unsub: ${countBefore}, after: ${countAfterWait} (stopped)`)
  })
})
