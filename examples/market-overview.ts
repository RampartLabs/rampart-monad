/**
 * Rampart SDK — Monad Market Overview
 *
 * One-shot DeFi dashboard: MON price, total TVL, best yields,
 * top DEX pools, lending rates, and arbitrage alerts.
 *
 * Run: npx tsx examples/market-overview.ts
 */

import {
  getMarketOverview,
  getKuruPools,
  getUniswapPools,
  detectDexArbitrage,
} from '../src/index'

const LINE = '━'.repeat(52)

function fmt(n: number, decimals = 4): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`
}

function fmtTVL(usd: number): string {
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(2)}B`
  if (usd >= 1_000_000)     return `$${(usd / 1_000_000).toFixed(1)}M`
  if (usd >= 1_000)         return `$${(usd / 1_000).toFixed(0)}K`
  return `$${usd.toFixed(2)}`
}

async function main() {
  console.log('\n🏰 Rampart — Monad Market Overview')
  console.log(`Updated: ${new Date().toLocaleString()}\n`)

  const t0 = Date.now()

  // Fetch everything in parallel
  const [overview, kuruPools, uniPools, arbAlerts] = await Promise.all([
    getMarketOverview(),
    getKuruPools().catch(() => []),
    getUniswapPools().catch(() => []),
    detectDexArbitrage('MON').catch(() => []),
  ])

  const elapsed = Date.now() - t0

  console.log(LINE)

  // ── MON Price ─────────────────────────────────────────────────
  console.log(`📈 MON Price   : $${fmt(overview.monPrice)}`)

  // ── Total TVL ─────────────────────────────────────────────────
  const b = overview.tvlBreakdown
  console.log(`💧 Total TVL   : ${fmtTVL(overview.totalDefiTVL)} across 30+ protocols`)
  console.log(`   ├ Liquid Staking : ${fmtTVL(b.liquidStaking)}`)
  console.log(`   ├ Lending        : ${fmtTVL(b.lending)}`)
  console.log(`   ├ RWA Vaults     : ${fmtTVL(b.rwa)}`)
  console.log(`   ├ Restaking      : ${fmtTVL(b.restaking)}`)
  console.log(`   └ Yield Optimzr  : ${fmtTVL(b.yieldOptimizer)}`)
  console.log()

  // ── Best yields ───────────────────────────────────────────────
  const bestLST     = overview.lstComparison.filter(l => l.apr > 0).sort((a, b) => b.apr - a.apr)[0]
  const bestSupply  = overview.topLendingRates.filter(r => r.supplyAPY > 0).sort((a, b) => b.supplyAPY - a.supplyAPY)[0]
  const bestBorrow  = overview.topLendingRates.filter(r => r.borrowAPR > 0).sort((a, b) => a.borrowAPR - b.borrowAPR)[0]

  if (bestLST)    console.log(`🥩 Best Staking : ${bestLST.token} → ${fmtPct(bestLST.apr)} APR`)
  if (bestSupply) console.log(`🏦 Best Supply  : ${bestSupply.asset} (${bestSupply.protocol}) → ${bestSupply.supplyAPY.toFixed(2)}% APY`)
  if (bestBorrow) console.log(`💸 Best Borrow  : ${bestBorrow.asset} (${bestBorrow.protocol}) → ${bestBorrow.borrowAPR.toFixed(2)}% APR`)
  console.log()

  // ── Top DEX pools ─────────────────────────────────────────────
  const allPools = [
    ...kuruPools.map(p  => ({ name: (p.token0 ?? p as any).baseSymbol  + '/' + (p.token1 ?? (p as any).quoteSymbol) + ' (Kuru)',    tvl: 0 })),
    ...uniPools.map(p   => ({ name: p.token0 + '/' + p.token1 + ' (Uniswap)', tvl: 0 })),
  ].slice(0, 5)

  if (allPools.length > 0) {
    console.log('🔄 DEX Pools:')
    allPools.forEach(p => console.log(`  ${p.name}`))
    console.log()
  }

  // ── Arbitrage alerts ──────────────────────────────────────────
  if (arbAlerts.length > 0) {
    console.log('⚡ Arbitrage Alerts:')
    arbAlerts.slice(0, 3).forEach(a => {
      const spread = ((a.spreadPct ?? 0) * 100).toFixed(2)
      console.log(`  ${a.token} — buy on ${a.buyDex}, sell on ${a.sellDex}  spread: ${spread}%`)
    })
    console.log()
  }

  // ── LST Ratios (cumulative exchange rates) ────────────────────
  if (overview.lstRatios) {
    const r = overview.lstRatios
    console.log('📊 LST Ratios  :')
    if (r.shMON) console.log(`   shMON  : ${r.shMON.toFixed(6)} MON/share`)
    if (r.aprMON) console.log(`   aprMON : ${r.aprMON.toFixed(6)} MON/share`)
    if (r.sMON)  console.log(`   sMON   : ${r.sMON.toFixed(6)} MON/share`)
    if (r.gMON)  console.log(`   gMON   : ${r.gMON.toFixed(6)} MON/share`)
    console.log()
  }

  // ── Gas price ─────────────────────────────────────────────────
  if (overview.gasPrice) {
    console.log(`⛽ Gas Price   : ${Number(overview.gasPrice) / 1e9} Gwei`)
    console.log()
  }

  // ── Best overall yield ────────────────────────────────────────
  const best = overview.bestYield
  if (best.apy > 0) {
    console.log(`🏆 Best Yield   : ${best.protocol} ${best.asset} → ${fmtPct(best.apy)} APY [${best.type}]`)
  }

  console.log()
  console.log(LINE)
  console.log(`Fetched in: ${elapsed}ms\n`)
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
