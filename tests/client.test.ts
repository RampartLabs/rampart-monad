import { describe, it, expect } from 'vitest'
import { Rampart } from '../src/client'

const r = new Rampart()

describe('Rampart class (Layer 2)', () => {
  it('getTokenPrice delegates to kuru', async () => {
    const price = await r.getTokenPrice('MON')
    expect(price.price).toBeGreaterThan(0)
    expect(price.token).toBe('MON')
    expect(price.source).toBe('kuru')
  })

  it('getStakingAPR delegates to apriori', async () => {
    const staking = await r.getStakingAPR()
    expect(staking.apr).toBeGreaterThan(0)
    expect(staking.protocol).toBe('apriori')
  })

  it('getLendingRates delegates to neverland', async () => {
    const rates = await r.getLendingRates()
    expect(rates.length).toBeGreaterThan(0)
    expect(rates[0].protocol).toBe('neverland')
  })

  it('getBestYieldStrategy returns staking or lending', async () => {
    const strategy = await r.getBestYieldStrategy()
    expect(['staking', 'lending']).toContain(strategy.type)
    expect(strategy.apy).toBeGreaterThan(0)
    expect(strategy.description.length).toBeGreaterThan(10)
    console.log(`  Best strategy: ${strategy.type} @ ${(strategy.apy * 100).toFixed(2)}% — ${strategy.protocol}`)
  })

  it('getMarketOverview returns full snapshot', async () => {
    const overview = await r.getMarketOverview()
    expect(overview.monPrice).toBeGreaterThan(0)
    expect(overview.stakingAPR.apr).toBeGreaterThan(0)
    expect(overview.topLendingRates.length).toBeGreaterThan(0)
    expect(overview.topPools.length).toBeGreaterThan(0)
    expect(overview.timestamp).toBeGreaterThan(0)
    console.log(`  MON: $${overview.monPrice.toFixed(4)}, staking: ${(overview.stakingAPR.apr * 100).toFixed(2)}%`)
  })

  it('compareYields returns staking vs lending comparison', async () => {
    const cmp = await r.compareYields()
    expect(['staking', 'lending']).toContain(cmp.recommendation)
    expect(cmp.staking.apr).toBeGreaterThan(0)
    expect(cmp.bestLending.supplyAPY).toBeGreaterThanOrEqual(0)
    console.log(`  Staking ${(cmp.staking.apr * 100).toFixed(2)}% vs best lending ${(cmp.bestLending.supplyAPY * 100).toFixed(2)}% → ${cmp.recommendation}`)
  })
})
