import { describe, it, expect } from 'vitest'
import { getPortfolio, getPortfolioSummary, getNativeBalance, getTokenBalances, getLSTPositions } from '../src/protocols/portfolio'

// Well-known Monad address with activity (use a known whale or protocol treasury)
const TEST_ADDRESS = '0x0000000000000000000000000000000000000001'  // burn address, will have 0 balance
const WHALE_ADDRESS = '0xba4dd672062de8feedb665dd4410658864483f1e'  // Euler factory (has token activity)

describe('Wallet Portfolio (Phase 13)', () => {
  it('getNativeBalance returns non-negative number', async () => {
    const bal = await getNativeBalance(TEST_ADDRESS)
    expect(bal).toBeGreaterThanOrEqual(0)
    console.log(`  Native MON balance of ${TEST_ADDRESS.slice(0,10)}...: ${bal}`)
  })

  it('getTokenBalances returns array (may be empty for test address)', async () => {
    const tokens = await getTokenBalances(TEST_ADDRESS)
    expect(Array.isArray(tokens)).toBe(true)
    console.log(`  Token balances found: ${tokens.length}`)
    tokens.forEach(t => console.log(`    ${t.symbol}: ${t.balance}`))
  })

  it('getLSTPositions returns array (may be empty)', async () => {
    const positions = await getLSTPositions(TEST_ADDRESS)
    expect(Array.isArray(positions)).toBe(true)
    console.log(`  LST positions found: ${positions.length}`)
    positions.forEach(p => console.log(`    ${p.token}: ${p.balance} (${p.monValue.toFixed(2)} MON)`))
  })

  it('getPortfolio returns complete portfolio structure', async () => {
    const portfolio = await getPortfolio(TEST_ADDRESS)
    expect(portfolio.address).toBe(TEST_ADDRESS)
    expect(portfolio.nativeBalance).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(portfolio.tokens)).toBe(true)
    expect(Array.isArray(portfolio.lstPositions)).toBe(true)
    expect(Array.isArray(portfolio.eulerPositions)).toBe(true)
    expect(portfolio.fetchedAt).toBeGreaterThan(0)
    console.log(`  Portfolio: ${portfolio.nativeBalance.toFixed(4)} MON native`)
    console.log(`  Total USD value: $${portfolio.totalUsdValue.toFixed(2)}`)
  }, 90_000)

  it('getPortfolioSummary returns breakdown', async () => {
    const summary = await getPortfolioSummary(TEST_ADDRESS)
    expect(summary.address).toBe(TEST_ADDRESS)
    expect(summary.totalUsd).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(summary.breakdown)).toBe(true)
    console.log(`  Portfolio summary: $${summary.totalUsd.toFixed(2)}`)
    summary.breakdown.forEach(b =>
      console.log(`    ${b.category.padEnd(15)}: $${b.usd.toFixed(2)} (${b.pct.toFixed(1)}%)`)
    )
  }, 90_000)
})
