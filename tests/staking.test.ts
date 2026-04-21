import { describe, it, expect } from 'vitest'
import { getAllLSTStats, getBestLST, compareLSTs, getTotalStakedMON } from '../src/protocols/staking'

describe('LST Aggregator — All 4 Liquid Staking Protocols (Phase 10)', () => {
  it('getAllLSTStats returns all 4 LSTs', async () => {
    const all = await getAllLSTStats()
    expect(all.length).toBeGreaterThanOrEqual(3) // at least aprMON, gMON, shMON
    const tokens = all.map(l => l.token)
    expect(tokens).toContain('aprMON')
    expect(tokens).toContain('gMON')
    expect(tokens).toContain('shMON')
    console.log('  All LSTs:')
    all.forEach(l => console.log(
      `    ${l.token.padEnd(7)} (${l.protocol.padEnd(9)}): APR=${(l.apr*100).toFixed(2)}%  TVL=${l.tvl.toLocaleString()} MON  rate=${l.exchangeRate.toFixed(6)}`
    ))
  })

  it('getBestLST returns LST with highest APR', async () => {
    const best = await getBestLST()
    expect(best.apr).toBeGreaterThan(0)
    expect(best.tvl).toBeGreaterThan(0)
    expect(best.exchangeRate).toBeGreaterThanOrEqual(1)
    console.log(`  Best LST: ${best.token} (${best.protocol}) @ ${(best.apr*100).toFixed(2)}% APR`)
  })

  it('shMON has largest TVL on Monad', async () => {
    const all = await getAllLSTStats()
    const shMON = all.find(l => l.token === 'shMON')
    expect(shMON).toBeDefined()
    expect(shMON!.tvl).toBeGreaterThan(100_000) // at least 100k MON
    console.log(`  shMON TVL: ${shMON!.tvl.toLocaleString()} MON (exchange rate: ${shMON!.exchangeRate.toFixed(4)})`)
  })

  it('compareLSTs returns recommendation with reason', async () => {
    const cmp = await compareLSTs()
    expect(cmp.best.apr).toBeGreaterThan(0)
    expect(cmp.all.length).toBeGreaterThanOrEqual(3)
    expect(cmp.totalTVL).toBeGreaterThan(1_000_000)
    expect(cmp.reason.length).toBeGreaterThan(10)
    console.log(`  Best: ${cmp.best.token} @ ${(cmp.best.apr*100).toFixed(2)}%`)
    console.log(`  Total staked: ${cmp.totalTVL.toLocaleString()} MON`)
    console.log(`  Reason: ${cmp.reason}`)
  })

  it('getTotalStakedMON > 400M (combined all LSTs)', async () => {
    const total = await getTotalStakedMON()
    expect(total).toBeGreaterThan(400_000) // >400k MON minimum
    console.log(`  Total MON staked across all LSTs: ${total.toLocaleString()} MON`)
  })
})
