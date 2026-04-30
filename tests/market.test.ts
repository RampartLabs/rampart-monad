import { describe, it, expect } from 'vitest'
import { getMarketOverview, getBestYields, getMonadDeFiTVL, getArbitrageAlerts, compareAssetYields } from '../src/aggregators/market'

describe('Market Intelligence (Phase 14)', () => {
  it('getBestYields returns ranked opportunities', async () => {
    const yields = await getBestYields(10)
    expect(yields.length).toBeGreaterThan(0)
    for (const y of yields) {
      expect(y.apy).toBeGreaterThanOrEqual(0)
      expect(['supply', 'stake', 'lp', 'vault']).toContain(y.type)
    }
    console.log('  Top yield opportunities:')
    yields.forEach(y =>
      console.log(`    ${y.protocol.padEnd(12)} ${y.type.padEnd(7)} ${y.asset.padEnd(8)}: ${(y.apy*100).toFixed(2)}% APY  TVL=${y.tvl.toLocaleString()}`)
    )
  }, 90_000)

  it('getMonadDeFiTVL returns positive USD value', async () => {
    const tvl = await getMonadDeFiTVL()
    expect(tvl).toBeGreaterThan(0)
    console.log(`  Total Monad DeFi TVL: $${tvl.toLocaleString()}`)
  }, 90_000)

  it('getArbitrageAlerts scans DEX spreads', async () => {
    const alerts = await getArbitrageAlerts()
    expect(Array.isArray(alerts)).toBe(true)
    if (alerts.length > 0) {
      for (const a of alerts) {
        expect(a.spreadPct).toBeGreaterThan(0)
      }
      console.log('  Arb alerts:')
      alerts.forEach(a => console.log(`    ${a.buyOn} → ${a.sellOn}: ${a.spreadPct.toFixed(2)}% spread`))
    } else {
      console.log('  No arbitrage opportunities above threshold')
    }
  }, 60_000)

  it('getMarketOverview returns full snapshot', async () => {
    const overview = await getMarketOverview()
    expect(overview.monPrice).toBeGreaterThan(0)
    expect(overview.totalDefiTVL).toBeGreaterThan(0)
    expect(overview.yields.length).toBeGreaterThan(0)
    expect(overview.bestYield).toBeDefined()
    expect(overview.lstComparison.length).toBeGreaterThan(0)
    console.log(`  MON price: $${overview.monPrice.toFixed(4)}`)
    console.log(`  Total TVL: $${overview.totalDefiTVL.toLocaleString()}`)
    console.log(`  Best yield: ${overview.bestYield.protocol} ${overview.bestYield.asset} @ ${(overview.bestYield.apy*100).toFixed(2)}%`)
    console.log(`  Arb alerts: ${overview.arbitrageAlerts.length}`)
    console.log('  LST comparison:')
    overview.lstComparison.forEach(l =>
      console.log(`    ${l.token.padEnd(8)}: ${(l.apr*100).toFixed(2)}% APR  TVL=${l.tvl.toLocaleString()} MON`)
    )
  }, 120_000)

  it('compareAssetYields for MON returns staking options', async () => {
    const yields = await compareAssetYields('MON')
    expect(Array.isArray(yields)).toBe(true)
    console.log(`  MON yield options: ${yields.length}`)
    yields.forEach(y => console.log(`    ${y.protocol}: ${(y.apy*100).toFixed(2)}%`))
  }, 90_000)
})
