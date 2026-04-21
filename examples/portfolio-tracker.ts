/**
 * Rampart SDK — Portfolio Tracker
 *
 * Shows a complete breakdown of a Monad wallet across all protocols:
 * native MON, ERC20 tokens, LST positions, and Euler lending positions.
 *
 * Run: npx tsx examples/portfolio-tracker.ts [address]
 * Or:  npx tsx examples/portfolio-tracker.ts  (uses demo address)
 */

import { getPortfolio, getVerifiedPrice } from '../src/index'

const LINE = '━'.repeat(52)

// Demo address — a known active Monad wallet with diverse positions
const DEMO_ADDRESS = '0x0000000000000000000000000000000000000001'

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtUSD(n: number): string {
  return `$${fmt(n)}`
}

function row(label: string, amount: number, usd?: number): string {
  const l = label.padEnd(16)
  const a = fmt(amount, 4).padStart(14)
  const u = usd !== undefined ? `  (${fmtUSD(usd)})` : ''
  return `  ${l} → ${a}${u}`
}

async function main() {
  // Accept address from CLI arg or use demo
  const address = (process.argv[2] ?? DEMO_ADDRESS) as `0x${string}`

  console.log('\n🏰 Rampart — Portfolio Tracker')
  console.log(`Address: ${address.slice(0, 6)}...${address.slice(-4)}\n`)

  const t0 = Date.now()

  // Fetch portfolio and MON price in parallel
  const [portfolio, monPrice] = await Promise.all([
    getPortfolio(address),
    getVerifiedPrice('MON').catch(() => ({ bestPrice: 0.35 })),
  ])

  const mon = monPrice.bestPrice

  console.log('💰 Portfolio Overview:')
  console.log(LINE)

  // ── Native MON ────────────────────────────────────────────────
  const nativeUSD = portfolio.nativeBalance * mon
  console.log('Native:')
  console.log(row('MON', portfolio.nativeBalance, nativeUSD))
  console.log()

  // ── ERC20 tokens ──────────────────────────────────────────────
  const tokens = portfolio.tokens.filter(t => t.balance > 0)
  if (tokens.length > 0) {
    console.log('Tokens:')
    for (const t of tokens) {
      console.log(row(t.symbol, t.balance, t.usdValue))
    }
    console.log()
  }

  // ── Liquid staking positions ──────────────────────────────────
  const lstPositions = portfolio.lstPositions.filter(p => p.balance > 0)
  if (lstPositions.length > 0) {
    console.log('Liquid Staking:')
    for (const p of lstPositions) {
      const usd = p.monValue * mon
      const aprStr = p.apr > 0 ? `  APR: ${(p.apr * 100).toFixed(1)}%` : ''
      console.log(row(p.token, p.balance, usd) + aprStr)
    }
    console.log()
  }

  // ── Euler lending positions ───────────────────────────────────
  const eulerPositions = portfolio.eulerPositions.filter(p => p.assetValue > 0)
  if (eulerPositions.length > 0) {
    console.log('Euler Lending (supplied):')
    for (const p of eulerPositions) {
      const aprStr = p.supplyAPY > 0 ? `  APY: ${p.supplyAPY.toFixed(1)}%` : ''
      console.log(row(p.assetSymbol, p.assetValue) + aprStr)
    }
    console.log()
  }

  // ── Summary ───────────────────────────────────────────────────
  const elapsed = Date.now() - t0

  // Compute total if portfolio.totalUsdValue is available, else sum manually
  let totalUSD = portfolio.totalUsdValue
  if (!totalUSD || totalUSD === 0) {
    totalUSD = nativeUSD
      + tokens.reduce((s, t) => s + (t.usdValue ?? 0), 0)
      + lstPositions.reduce((s, p) => s + p.monValue * mon, 0)
  }

  console.log(LINE)
  console.log(`Total Value : ${fmtUSD(totalUSD)}`)
  console.log(`MON Price   : ${fmtUSD(mon)}`)
  console.log(`Fetched in  : ${elapsed}ms\n`)

  if (address === DEMO_ADDRESS) {
    console.log('💡 Tip: pass your own address as an argument')
    console.log('   npx tsx examples/portfolio-tracker.ts 0xYourAddress\n')
  }
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
