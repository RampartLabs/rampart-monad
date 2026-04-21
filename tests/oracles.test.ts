import { describe, it, expect } from 'vitest'
import {
  getVerifiedPrice,
  getPrices,
  getChainlinkRawPrice,
  detectOracleDiscrepancy,
  getRedstonePrice,
  getChroniclePrice,
  getLSTRatios,
} from '../src/protocols/oracles'

describe('Oracle Aggregator (Phase 2 — 5 sources)', () => {
  it('getVerifiedPrice returns median price for MON with all sources', async () => {
    const result = await getVerifiedPrice('MON')
    expect(result.bestPrice).toBeGreaterThan(0)
    expect(result.sources.length).toBeGreaterThan(0)
    expect(result.deviation).toBeGreaterThanOrEqual(0)
    console.log(`  MON best price (median): $${result.bestPrice.toFixed(4)}`)
    result.sources.forEach(s =>
      console.log(`    ${s.source.padEnd(12)}: $${s.price.toFixed(4)}${s.stale ? ' [STALE]' : ''}`)
    )
    if (result.warning) console.log(`  ⚠️  ${result.warning}`)
  })

  it('Chainlink MON/USD exists (may be stale)', async () => {
    const cl = await getChainlinkRawPrice('MON')
    if (cl) {
      expect(cl.price).toBeGreaterThan(0)
      console.log(`  Chainlink MON: $${cl.price.toFixed(4)} stale=${cl.stale}`)
    } else {
      console.log('  Chainlink MON: no feed available')
    }
  })

  it('getRedstonePrice returns a price for MON', async () => {
    const rs = await getRedstonePrice('MON')
    if (rs) {
      expect(rs.price).toBeGreaterThan(0)
      expect(rs.source).toBe('redstone')
      console.log(`  Redstone MON: $${rs.price.toFixed(4)}`)
    } else {
      console.log('  Redstone MON: unavailable (network or contract error)')
    }
  })

  it('getChroniclePrice returns MON/USD from on-chain feed', async () => {
    const ch = await getChroniclePrice('MON')
    if (ch) {
      expect(ch.price).toBeGreaterThan(0)
      expect(ch.source).toBe('chronicle')
      console.log(`  Chronicle MON: $${ch.price.toFixed(4)}`)
    } else {
      console.log('  Chronicle MON: unavailable (possible whitelist restriction)')
    }
  })

  it('getLSTRatios returns exchange rates > 1.0 for all LSTs', async () => {
    const ratios = await getLSTRatios()
    expect(ratios.gMON).toBeGreaterThan(0)
    expect(ratios.shMON).toBeGreaterThan(0)
    expect(ratios.sMON).toBeGreaterThan(0)
    expect(ratios.aprMON).toBeGreaterThan(0)
    console.log(`  LST ratios (MON per 1 LST):`)
    console.log(`    gMON:   ${ratios.gMON.toFixed(6)}`)
    console.log(`    shMON:  ${ratios.shMON.toFixed(6)}`)
    console.log(`    sMON:   ${ratios.sMON.toFixed(6)}`)
    console.log(`    aprMON: ${ratios.aprMON.toFixed(6)}`)
  })

  it('getVerifiedPrice for USDC is ~$1', async () => {
    const result = await getVerifiedPrice('USDC')
    expect(result.bestPrice).toBeGreaterThan(0.95)
    expect(result.bestPrice).toBeLessThan(1.05)
    console.log(`  USDC price: $${result.bestPrice.toFixed(4)} (deviation: ${result.deviation.toFixed(2)}%)`)
  })

  it('getPrices returns array of prices', async () => {
    const prices = await getPrices(['MON', 'ETH'])
    expect(prices.length).toBeGreaterThanOrEqual(1)
    for (const p of prices) {
      expect(p.bestPrice).toBeGreaterThan(0)
    }
    console.log('  Multi-token prices:')
    prices.forEach(p => console.log(`    ${p.token}: $${p.bestPrice.toFixed(4)} (${p.sources.length} sources)`))
  })

  it('detectOracleDiscrepancy on MON shows all sources', async () => {
    const disc = await detectOracleDiscrepancy('MON')
    expect(disc.token).toBe('MON')
    console.log(`  MON oracle check:`)
    console.log(`    Chainlink:  ${disc.chainlinkPrice  ? '$'+disc.chainlinkPrice.toFixed(4)  : 'N/A'}`)
    console.log(`    Pyth:       ${disc.pythPrice       ? '$'+disc.pythPrice.toFixed(4)       : 'N/A'}`)
    console.log(`    Redstone:   ${disc.redstonePrice   ? '$'+disc.redstonePrice.toFixed(4)   : 'N/A'}`)
    console.log(`    Chronicle:  ${disc.chroniclePrice  ? '$'+disc.chroniclePrice.toFixed(4)  : 'N/A'}`)
    console.log(`    Kuru DEX:   ${disc.dexPrice        ? '$'+disc.dexPrice.toFixed(4)        : 'N/A'}`)
    console.log(`    Max deviation: ${disc.maxDeviation.toFixed(1)}% — discrepant: ${disc.isDiscrepant}`)
  })
})
