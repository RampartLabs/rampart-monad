import { describe, it, expect } from 'vitest'
import { getUniswapPools, getUniswapPrice, compareWithKuru } from '../src/protocols/uniswap'

describe('DEX Aggregator (Phase 4)', () => {
  it('getUniswapPools returns available markets', async () => {
    const pools = await getUniswapPools()
    expect(pools.length).toBeGreaterThan(0)
    const monPools = pools.filter(p => p.token0 === 'MON')
    expect(monPools.length).toBeGreaterThan(0)
    console.log(`  Markets: ${pools.map(p => p.token0 + '/' + p.token1 + '@' + ((p.fee ?? 0) * 10000) + 'bps').join(', ')}`)
  })

  it('getUniswapPrice returns realistic MON price', async () => {
    const price = await getUniswapPrice('MON')
    expect(price).toBeGreaterThan(0.01)
    expect(price).toBeLessThan(1000)
    console.log(`  MON price (best market): $${price.toFixed(5)}`)
  })

  it('compareWithKuru returns spread data for MON', async () => {
    const result = await compareWithKuru('MON')
    expect(result.token).toBe('MON')
    expect(result.kuru).toBeGreaterThan(0)
    expect(result.uniswap).toBeGreaterThan(0)
    expect(result.spreadPct).toBeGreaterThanOrEqual(0)
    console.log(`  kuru: $${result.kuru.toFixed(5)} | best: $${result.uniswap.toFixed(5)} | spread: ${result.spreadPct.toFixed(4)}%`)
  })
})
