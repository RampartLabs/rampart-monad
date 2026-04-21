import { describe, it, expect } from 'vitest'
import {
  getTokenPrice,
  getKuruPools,
  getOrderbook,
  simulateKuruSwap,
} from '../src/protocols/kuru'

describe('Kuru DEX', () => {
  it('MON price > 0 and realistic (> $0.01)', async () => {
    const result = await getTokenPrice('MON')
    expect(result.token).toBe('MON')
    expect(result.price).toBeGreaterThan(0.01)
    expect(result.price).toBeLessThan(1000)
    expect(result.source).toBe('kuru')
    console.log(`  MON price: $${result.price.toFixed(5)} USDC`)
  })

  it('getKuruPools returns at least 4 pools', async () => {
    const pools = await getKuruPools()
    expect(pools.length).toBeGreaterThanOrEqual(4)
    const monPools = pools.filter(p => p.token0 === 'MON' || p.token1 === 'MON')
    expect(monPools.length).toBeGreaterThan(0)
    console.log(`  Total pools: ${pools.length}`)
    pools.slice(0, 4).forEach(p => {
      console.log(`    ${p.token0}/${p.token1} fee=${((p.fee ?? 0) * 10000).toFixed(0)}bps vol24h=${p.volume24h?.toFixed(0) ?? 'n/a'}`)
    })
  })

  it('MON_USDC orderbook has bids and asks with tight spread', async () => {
    const ob = await getOrderbook('MON_USDC')
    expect(ob.bids.length).toBeGreaterThan(0)
    expect(ob.asks.length).toBeGreaterThan(0)
    expect(ob.midPrice).toBeGreaterThan(0)
    expect(ob.spread).toBeGreaterThan(0)
    const spreadPct = ob.spread / ob.midPrice * 100
    expect(spreadPct).toBeLessThan(5) // reasonable spread
    console.log(`  mid: $${ob.midPrice.toFixed(5)} | spread: ${spreadPct.toFixed(4)}%`)
    console.log(`  best bid: $${ob.bids[0][0].toFixed(5)} x ${ob.bids[0][1].toFixed(2)} MON`)
    console.log(`  best ask: $${ob.asks[0][0].toFixed(5)} x ${ob.asks[0][1].toFixed(2)} MON`)
  })

  it('simulate swap 100 USDC → MON returns valid result', async () => {
    const sim = await simulateKuruSwap('USDC', 'MON', 100)
    expect(sim.amountOut).toBeGreaterThan(0)
    expect(sim.priceImpact).toBeGreaterThanOrEqual(0)
    expect(sim.priceImpact).toBeLessThan(0.1) // < 10% impact for 100 USDC
    console.log(`  100 USDC → ${sim.amountOut.toFixed(4)} MON`)
    console.log(`  price impact: ${(sim.priceImpact * 100).toFixed(4)}%`)
  })
})
