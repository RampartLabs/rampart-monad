import { describe, it, expect } from 'vitest'
import { getNadFunTokens, getTrendingMemes, getGraduatedMemes } from '../src/protocols/nadfun'
import {
  getMondayMarkets, getPerplMarkets, getPerpVaultStats,
  getFundingRates, getPerplTVL, getTotalPerpTVL,
} from '../src/protocols/perps'

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

describe('Perpl Exchange (Phase 15b)', () => {
  it('getMondayMarkets returns empty array (SynFutures ABI unverified)', async () => {
    const markets = await getMondayMarkets()
    expect(Array.isArray(markets)).toBe(true)
    console.log(`  Monday Markets: ${markets.length} (expected 0 — SynFutures contracts unverified)`)
  }, 30_000)

  it('getPerplMarkets returns active markets with all fields', async () => {
    const markets = await getPerplMarkets()
    expect(Array.isArray(markets)).toBe(true)
    expect(markets.length).toBeGreaterThan(0)

    for (const m of markets) {
      expect(m.protocol).toBe('perpl')
      expect(m.perpId).toBeGreaterThan(0)
      expect(m.asset.length).toBeGreaterThan(0)
      expect(m.markPrice).toBeGreaterThanOrEqual(0)
      expect(m.oraclePrice).toBeGreaterThanOrEqual(0)
      expect(m.longOI).toBeGreaterThanOrEqual(0)
      expect(m.shortOI).toBeGreaterThanOrEqual(0)
      expect(m.totalOI).toBeCloseTo(m.longOI + m.shortOI, 6)
      expect(typeof m.fundingRatePct).toBe('number')
      expect(m.fundingInterval).toBeGreaterThan(0)
      expect(m.tvlUSD).toBeGreaterThanOrEqual(0)
      expect(m.maxBid).toBeGreaterThanOrEqual(0)
      expect(m.minBid).toBeGreaterThanOrEqual(0)
      expect(['bullish', 'bearish', 'neutral']).toContain(m.sentiment)
    }

    const sorted = [...markets]
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].tvlUSD).toBeLessThanOrEqual(sorted[i - 1].tvlUSD)
    }

    console.log('  Perpl markets:')
    markets.forEach(m =>
      console.log(
        `    #${m.perpId} ${m.asset.padEnd(12)} mark=$${m.markPrice.toFixed(4)}` +
        ` oracle=$${m.oraclePrice.toFixed(4)} longOI=${m.longOI.toFixed(0)}` +
        ` shortOI=${m.shortOI.toFixed(0)} sentiment=${m.sentiment}` +
        ` bid=${m.minBid.toFixed(4)}–${m.maxBid.toFixed(4)} tvl=$${m.tvlUSD.toFixed(0)}`
      )
    )
  }, 60_000)

  it('getPerpVaultStats includes tvl, totalOI, utilizationRate, accounts', async () => {
    const stats = await getPerpVaultStats()
    expect(Array.isArray(stats)).toBe(true)
    expect(stats.length).toBeGreaterThan(0)

    for (const s of stats) {
      expect(s.protocol).toBe('perpl')
      expect(s.tvl).toBeGreaterThanOrEqual(0)
      expect(s.totalOI).toBeGreaterThanOrEqual(0)
      expect(s.utilizationRate).toBeGreaterThanOrEqual(0)
      expect(s.utilizationRate).toBeLessThanOrEqual(1)
      expect(s.accounts).toBeGreaterThanOrEqual(0)
    }

    stats.forEach(s =>
      console.log(
        `  ${s.protocol}: TVL=$${s.tvl.toLocaleString()} OI=$${s.totalOI.toFixed(0)}` +
        ` util=${(s.utilizationRate * 100).toFixed(1)}% accounts=${s.accounts}`
      )
    )
  }, 60_000)

  it('getFundingRates returns one entry per active market', async () => {
    const rates = await getFundingRates()
    expect(Array.isArray(rates)).toBe(true)
    expect(rates.length).toBeGreaterThan(0)

    for (const r of rates) {
      expect(r.protocol).toBe('perpl')
      expect(r.asset.length).toBeGreaterThan(0)
      expect(typeof r.rate).toBe('number')
      expect(r.fundingInterval).toBeGreaterThan(0)
    }

    console.log('  Funding rates:')
    rates.forEach(r =>
      console.log(`    ${r.asset.padEnd(12)} rate=${(r.rate * 100).toFixed(5)}% interval=${r.fundingInterval} blocks`)
    )
  }, 60_000)

  it('getPerplTVL returns positive USD value', async () => {
    const tvl = await getPerplTVL()
    expect(tvl).toBeGreaterThan(0)
    console.log(`  Perpl TVL (AUSD): $${tvl.toLocaleString()}`)
  }, 30_000)

  it('getTotalPerpTVL equals getPerplTVL', async () => {
    const [total, perpl] = await Promise.all([getTotalPerpTVL(), getPerplTVL()])
    expect(total).toBe(perpl)
    console.log(`  Total perp TVL: $${total.toLocaleString()}`)
  }, 30_000)
})
