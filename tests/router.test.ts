import { describe, it, expect } from 'vitest'
import { getBestSwapRoute, getAllSwapQuotes, detectDexArbitrage } from '../src/aggregators/router'

describe('Multi-DEX Router (Phase 9)', () => {
  it('getBestSwapRoute returns best route for WMON→AUSD', async () => {
    const result = await getBestSwapRoute('WMON', 'AUSD', 10)
    expect(result.best.amountOut).toBeGreaterThan(0)
    expect(result.best.isBest).toBe(true)
    expect(result.all.length).toBeGreaterThanOrEqual(1)
    // Only one route can be best
    expect(result.all.filter(r => r.isBest).length).toBe(1)
    console.log(`  Best route: ${result.best.dex} → ${result.best.amountOut.toFixed(4)} AUSD for 10 WMON`)
    console.log(`  All routes: ${result.all.map(r => `${r.dex}:${r.amountOut.toFixed(4)}`).join(', ')}`)
  })

  it('getAllSwapQuotes returns multiple DEX quotes', async () => {
    const quotes = await getAllSwapQuotes('WMON', 'USDC', 5)
    expect(quotes.length).toBeGreaterThanOrEqual(1)
    // All routes should have positive output
    for (const q of quotes) {
      expect(q.amountOut).toBeGreaterThan(0)
      expect(q.tokenIn).toBe('WMON')
      expect(q.tokenOut).toBe('USDC')
    }
    console.log(`  DEX quotes for 5 WMON→USDC:`)
    quotes.forEach(q => console.log(`    ${q.dex.padEnd(12)}: ${q.amountOut.toFixed(4)} USDC${q.warning ? ' ⚠️  '+q.warning.slice(0,40) : ''}`))
  })

  it('detectDexArbitrage finds spread between DEXes', async () => {
    const arb = await detectDexArbitrage('WMON', 'AUSD', 100, 1)
    // May or may not find opportunity, but function should not throw
    if (arb) {
      expect(arb.spreadPct).toBeGreaterThan(0)
      expect(arb.buy).not.toBe(arb.sell)
      console.log(`  Arbitrage: buy on ${arb.buy}, sell on ${arb.sell}, spread=${arb.spreadPct.toFixed(2)}%`)
    } else {
      console.log('  No arbitrage opportunity found above threshold')
    }
  })

  it('best route returns positive amount for any supported pair', async () => {
    const result = await getBestSwapRoute('WMON', 'USDC', 1)
    expect(result.best.amountOut).toBeGreaterThan(0)
    expect(result.all.length).toBeGreaterThanOrEqual(1)
    // Note: Kuru trades native MON (not WMON), so WMON routes use Uniswap/Pancake
    console.log(`  1 WMON → ${result.best.amountOut.toFixed(6)} USDC via ${result.best.dex}`)
    if (result.best.warning) console.log(`  ⚠️  ${result.best.warning}`)
  })
})
