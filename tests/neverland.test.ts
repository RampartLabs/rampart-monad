import { describe, it, expect } from 'vitest'
import {
  getLendingRates,
  getBestSupplyAsset,
  getBestBorrowAsset,
  getNeverlandTVL,
  compareYields,
} from '../src/protocols/neverland'
import { getStakingAPR } from '../src/protocols/apriori'

describe('Neverland Lending', () => {
  it('getLendingRates returns at least 5 reserves with valid rates', async () => {
    const rates = await getLendingRates()
    expect(rates.length).toBeGreaterThanOrEqual(5)

    rates.forEach(r => {
      expect(r.protocol).toBe('neverland')
      expect(r.supplyAPY).toBeGreaterThanOrEqual(0)
      expect(r.borrowAPR).toBeGreaterThanOrEqual(0)
    })

    console.log('  Lending rates:')
    rates.forEach(r => {
      console.log(`    ${r.asset.padEnd(10)} supply=${(r.supplyAPY*100).toFixed(4)}% borrow=${(r.borrowAPR*100).toFixed(4)}% tvl=${r.totalSupply.toFixed(2)}`)
    })
  })

  it('getBestSupplyAsset has positive APY', async () => {
    const best = await getBestSupplyAsset()
    expect(best.supplyAPY).toBeGreaterThan(0)
    console.log(`  Best supply: ${best.asset} @ ${(best.supplyAPY * 100).toFixed(4)}% APY`)
  })

  it('getBestBorrowAsset has reasonable borrow rate', async () => {
    const best = await getBestBorrowAsset()
    expect(best.borrowAPR).toBeGreaterThanOrEqual(0)
    expect(best.borrowAPR).toBeLessThan(10) // < 1000% borrow rate
    console.log(`  Best borrow: ${best.asset} @ ${(best.borrowAPR * 100).toFixed(4)}% APR`)
  })

  it('compareYields returns valid recommendation', async () => {
    const [stakingAPR, comparison] = await Promise.all([
      getStakingAPR(),
      getLendingRates().then(async (rates) => {
        const best = rates.reduce((b, r) => r.supplyAPY > b.supplyAPY ? r : b)
        const { compareYields: cY } = await import('../src/protocols/neverland')
        const staking = await getStakingAPR()
        return cY(staking)
      }),
    ])

    expect(['staking', 'lending']).toContain(comparison.recommendation)
    expect(comparison.reason.length).toBeGreaterThan(10)
    console.log(`  staking APR: ${(stakingAPR.apr*100).toFixed(2)}%`)
    console.log(`  best lending: ${comparison.bestLending.asset} ${(comparison.bestLending.supplyAPY*100).toFixed(2)}%`)
    console.log(`  recommendation: ${comparison.recommendation}`)
    console.log(`  reason: ${comparison.reason}`)
  })
})
