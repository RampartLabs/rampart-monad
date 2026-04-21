import { describe, it, expect } from 'vitest'
import {
  getStakingAPR,
  getAPrioriExchangeRate,
  getAPrioriTVL,
  getAPrioriStats,
} from '../src/protocols/apriori'

describe('aPriori Liquid Staking', () => {
  it('exchangeRate >= 1 (aprMON always worth >= 1 MON)', async () => {
    const rate = await getAPrioriExchangeRate()
    expect(rate).toBeGreaterThanOrEqual(1)
    expect(rate).toBeLessThan(10) // sanity upper bound
    console.log(`  exchangeRate: ${rate.toFixed(8)} MON/aprMON`)
  })

  it('TVL > 0 and realistic (> 1000 MON)', async () => {
    const tvl = await getAPrioriTVL()
    expect(tvl).toBeGreaterThan(1_000)
    console.log(`  TVL: ${tvl.toLocaleString('en', { maximumFractionDigits: 0 })} MON`)
  })

  it('APR in realistic range (2% – 50%)', async () => {
    const result = await getStakingAPR()
    expect(result.protocol).toBe('apriori')
    expect(result.apr).toBeGreaterThan(0.02)
    expect(result.apr).toBeLessThan(0.50)
    expect(result.tvl).toBeGreaterThan(0)
    expect(result.exchangeRate).toBeGreaterThanOrEqual(1)
    expect(result.timestamp).toBeGreaterThan(0)
    console.log(`  APR: ${(result.apr * 100).toFixed(4)}%`)
    console.log(`  TVL: ${result.tvl.toLocaleString('en', { maximumFractionDigits: 0 })} MON`)
    console.log(`  exchangeRate: ${result.exchangeRate.toFixed(8)}`)
  })

  it('multicall stats match individual calls', async () => {
    const [stats, rate, tvl] = await Promise.all([
      getAPrioriStats(),
      getAPrioriExchangeRate(),
      getAPrioriTVL(),
    ])

    // Values should be close (may differ slightly due to block progression)
    expect(Math.abs(stats.exchangeRate - rate) / rate).toBeLessThan(0.001) // <0.1% drift
    expect(Math.abs(stats.tvl - tvl) / tvl).toBeLessThan(0.001)
    expect(stats.apr).toBeGreaterThan(0.02)
    console.log(`  multicall APR: ${(stats.apr * 100).toFixed(4)}%`)
  })
})
