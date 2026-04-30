import { describe, it, expect } from 'vitest'
import { getBalancerPools, getBalancerTVL, WEIGHTED_FACTORY, STABLE_FACTORY } from '../src/protocols/balancer'

describe('Balancer V3 (Phase 16)', () => {
  it('factory addresses are correct checksummed hex', () => {
    expect(WEIGHTED_FACTORY).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(STABLE_FACTORY).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })

  it('getBalancerPools returns pools with all required fields', async () => {
    const pools = await getBalancerPools()
    expect(Array.isArray(pools)).toBe(true)
    expect(pools.length).toBeGreaterThan(0)

    for (const p of pools) {
      expect(p.protocol).toBe('balancer')
      expect(p.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(['weighted', 'stable', 'unknown']).toContain(p.type)
      expect(Array.isArray(p.tokens)).toBe(true)
      expect(p.tokens.length).toBeGreaterThan(0)
      expect(Array.isArray(p.balances)).toBe(true)
      expect(p.balances.length).toBe(p.tokens.length)
      expect(p.swapFee).toBeGreaterThanOrEqual(0)
      expect(p.swapFee).toBeLessThan(1)
      expect(Array.isArray(p.weights)).toBe(true)
      expect(p.tvlUSD).toBeGreaterThanOrEqual(0)

      if (p.type === 'weighted' && p.weights.length > 0) {
        const sum = p.weights.reduce((a, b) => a + b, 0)
        expect(sum).toBeCloseTo(1, 1)
      }
    }

    const sorted = [...pools]
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].tvlUSD).toBeLessThanOrEqual(sorted[i - 1].tvlUSD)
    }

    console.log(`  Balancer pools: ${pools.length}`)
    pools.slice(0, 5).forEach(p =>
      console.log(
        `    [${p.type.padEnd(8)}] ${p.tokens.join('/')} fee=${(p.swapFee * 100).toFixed(3)}%` +
        ` tvl=$${p.tvlUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      )
    )
  }, 60_000)

  it('getBalancerPools weighted pools have normalized weights summing to ~1', async () => {
    const pools = await getBalancerPools()
    const weighted = pools.filter(p => p.type === 'weighted' && p.weights.length > 0)
    if (weighted.length === 0) {
      console.log('  No weighted pools with on-chain weights returned (all have API-sourced fees only)')
      return
    }
    for (const p of weighted) {
      const sum = p.weights.reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(1, 1)
      console.log(`    ${p.tokens.join('/')} weights=[${p.weights.map(w => w.toFixed(2)).join(', ')}]`)
    }
  }, 60_000)

  it('getBalancerPools stable/surge pools have empty weights array', async () => {
    const pools = await getBalancerPools()
    const stable = pools.filter(p => p.type === 'stable')
    for (const p of stable) {
      expect(p.weights).toEqual([])
    }
    console.log(`  Stable/surge pools: ${stable.length}`)
  }, 60_000)

  it('getBalancerTVL returns positive USD value', async () => {
    const tvl = await getBalancerTVL()
    expect(tvl).toBeGreaterThan(0)
    console.log(`  Balancer TVL: $${tvl.toLocaleString(undefined, { maximumFractionDigits: 0 })}`)
  }, 60_000)

  it('getBalancerTVL equals sum of pool tvlUSD', async () => {
    const [tvl, pools] = await Promise.all([getBalancerTVL(), getBalancerPools()])
    const sum = pools.reduce((s, p) => s + p.tvlUSD, 0)
    expect(tvl).toBeCloseTo(sum, 0)
  }, 60_000)
})
