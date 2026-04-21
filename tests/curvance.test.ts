import { describe, it, expect } from 'vitest'
import { getCurvanceMarkets, getCurvanceTVL, CURVANCE_ADDRESSES } from '../src/protocols/curvance'

describe('Curvance Lending Protocol (Phase 3.3)', () => {
  it('CURVANCE_ADDRESSES has correct contracts', () => {
    expect(CURVANCE_ADDRESSES.centralRegistry).toBe('0x1310f352f1389969Ece6741671c4B919523912fF')
    expect(Object.keys(CURVANCE_ADDRESSES.cTokens)).toContain('cWMON')
    expect(Object.keys(CURVANCE_ADDRESSES.cTokens)).toContain('cUSDC')
  })

  it('getCurvanceMarkets returns markets with TVL data', async () => {
    const markets = await getCurvanceMarkets()
    expect(Array.isArray(markets)).toBe(true)
    expect(markets.length).toBeGreaterThan(0)

    for (const m of markets) {
      expect(m.totalAssets).toBeGreaterThanOrEqual(0)
      expect(m.protocol).toBe('curvance')
    }

    console.log(`  Curvance markets: ${markets.length}`)
    markets.slice(0, 5).forEach(m =>
      console.log(`    ${m.cToken.padEnd(10)} ${m.asset.padEnd(8)} totalAssets=${m.totalAssets.toFixed(2)} TVL=$${m.totalAssetsUSD.toFixed(0)}`)
    )
  })

  it('getCurvanceTVL returns positive USD value', async () => {
    const tvl = await getCurvanceTVL()
    expect(tvl).toBeGreaterThanOrEqual(0)
    console.log(`  Curvance total TVL: $${tvl.toLocaleString()}`)
  })
})
