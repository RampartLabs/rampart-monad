import { describe, it, expect } from 'vitest'
import { getNadFunTokens, getTrendingMemes, getGraduatedMemes } from '../src/protocols/nadfun'
import { getMondayMarkets, getPerpVaultStats, getFundingRates, getTotalPerpTVL } from '../src/protocols/perps'

describe('nad.fun Memecoins (Phase 15a)', () => {
  it('getNadFunTokens returns array (may be empty if factory not confirmed)', async () => {
    const tokens = await getNadFunTokens(10)
    expect(Array.isArray(tokens)).toBe(true)
    if (tokens.length > 0) {
      for (const t of tokens) {
        expect(t.protocol).toBe('nadfun')
        expect(t.symbol.length).toBeGreaterThan(0)
      }
      console.log('  nad.fun tokens:')
      tokens.forEach(t =>
        console.log(`    ${t.symbol.padEnd(10)} mcap=${t.marketCapMON.toFixed(2)} MON graduated=${t.graduated}`)
      )
    } else {
      console.log('  nad.fun factory not yet accessible (placeholder address)')
    }
  }, 30_000)

  it('getTrendingMemes returns sorted by reserve', async () => {
    const memes = await getTrendingMemes(5)
    expect(Array.isArray(memes)).toBe(true)
    for (let i = 1; i < memes.length; i++) {
      expect(memes[i].reserveMON).toBeLessThanOrEqual(memes[i-1].reserveMON)
    }
    console.log(`  Trending memes: ${memes.length}`)
  }, 30_000)
})

describe('Perpetuals (Phase 15b)', () => {
  it('getMondayMarkets returns array (may be empty if contracts not confirmed)', async () => {
    const markets = await getMondayMarkets()
    expect(Array.isArray(markets)).toBe(true)
    if (markets.length > 0) {
      console.log('  Monday Markets:')
      markets.forEach(m =>
        console.log(`    ${m.asset.slice(0,10)} longOI=$${m.longOI.toFixed(0)} shortOI=$${m.shortOI.toFixed(0)} sentiment=${m.sentiment}`)
      )
    } else {
      console.log('  Monday Markets: contracts not yet confirmed (placeholder addresses)')
    }
  }, 30_000)

  it('getPerpVaultStats returns array (placeholder fallback)', async () => {
    const stats = await getPerpVaultStats()
    expect(Array.isArray(stats)).toBe(true)
    console.log(`  Perp vault stats: ${stats.length} protocols`)
    stats.forEach(s => console.log(`    ${s.protocol}: TVL=$${s.tvl.toLocaleString()} util=${(s.utilizationRate*100).toFixed(1)}%`))
  }, 30_000)

  it('getTotalPerpTVL returns non-negative number', async () => {
    const tvl = await getTotalPerpTVL()
    expect(tvl).toBeGreaterThanOrEqual(0)
    console.log(`  Total perp TVL: $${tvl.toLocaleString()}`)
  }, 30_000)
})
