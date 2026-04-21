/**
 * Rampart SDK — Yield Finder
 *
 * Scans all Monad DeFi protocols and ranks every yield opportunity
 * in a single unified list. Covers LSTs, lending, and vaults.
 *
 * Run: npx tsx examples/yield-finder.ts
 */

import {
  getAllLSTStats,
  getLendingRates,
  getEulerVaults,
  getMorphoVaults,
  getUpshiftVaults,
  getGearboxPools,
} from '../src/index'

const LINE = '━'.repeat(52)

interface YieldEntry {
  rank:     number
  name:     string
  category: string
  apy:      number
  tvl:      number
}

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtTVL(usd: number): string {
  if (usd >= 1_000_000) return `$${fmt(usd / 1_000_000)}M`
  if (usd >= 1_000)     return `$${fmt(usd / 1_000)}K`
  return usd > 0 ? `$${fmt(usd)}` : '—'
}

async function main() {
  console.log('\n🏰 Rampart — Yield Finder')
  console.log('Fetching live data from Monad mainnet...\n')

  const t0 = Date.now()

  // Fetch all yield sources in parallel
  const [lsts, lending, euler, morpho, upshift, gearbox] = await Promise.all([
    getAllLSTStats().catch(() => []),
    getLendingRates().catch(() => []),
    getEulerVaults(20).catch(() => []),
    getMorphoVaults(20).catch(() => []),
    getUpshiftVaults().catch(() => []),
    getGearboxPools().catch(() => []),
  ])

  const entries: Omit<YieldEntry, 'rank'>[] = []

  // ── Liquid Staking ────────────────────────────────────────────
  for (const lst of lsts) {
    if (lst.apr > 0) {
      entries.push({
        name:     `${lst.token} (${lst.protocol})`,
        category: 'LST',
        apy:      lst.apr * 100,
        tvl:      lst.tvl * 0.35,  // MON → USD at ~$0.35
      })
    }
  }

  // Cap implausible APY values — anything above 500% is likely a stale/bad oracle read
  const cap = (apy: number) => Math.min(apy, 500)

  // ── Neverland lending (supply APY only) ───────────────────────
  for (const rate of lending) {
    if (rate.supplyAPY > 0.5 && rate.supplyAPY < 500) {
      entries.push({
        name:     `${rate.asset} (Neverland)`,
        category: 'Lending',
        apy:      rate.supplyAPY,
        tvl:      0,
      })
    }
  }

  // ── Euler V2 vaults ───────────────────────────────────────────
  for (const vault of euler.slice(0, 10)) {
    if (vault.supplyAPY > 0.5 && vault.supplyAPY < 500) {
      entries.push({
        name:     `${vault.assetSymbol} (Euler V2)`,
        category: 'Lending',
        apy:      cap(vault.supplyAPY),
        tvl:      vault.totalAssets,
      })
    }
  }

  // ── Morpho Blue vaults ────────────────────────────────────────
  for (const vault of morpho.slice(0, 10)) {
    if (vault.supplyAPY > 0.5 && vault.supplyAPY < 500) {
      entries.push({
        name:     `${vault.assetSymbol} (Morpho)`,
        category: 'Vault',
        apy:      cap(vault.supplyAPY),
        tvl:      vault.totalAssets,
      })
    }
  }

  // ── Upshift yield vaults ──────────────────────────────────────
  for (const vault of upshift) {
    if (vault.apy > 0.5 && vault.apy < 500) {
      entries.push({
        name:     `${vault.name} (Upshift)`,
        category: 'Vault',
        apy:      cap(vault.apy),
        tvl:      vault.totalAssets,
      })
    }
  }

  // ── Gearbox lending pools ─────────────────────────────────────
  for (const pool of gearbox) {
    if (pool.supplyAPY > 0.5 && pool.supplyAPY < 500) {
      entries.push({
        name:     `${pool.assetSymbol} (Gearbox)`,
        category: 'Lending',
        apy:      cap(pool.supplyAPY),
        tvl:      pool.totalAssets,
      })
    }
  }

  // Sort by APY descending
  const ranked: YieldEntry[] = entries
    .sort((a, b) => b.apy - a.apy)
    .map((e, i) => ({ ...e, rank: i + 1 }))

  const elapsed = Date.now() - t0

  // ── Print results ─────────────────────────────────────────────
  console.log(`📊 Best Yield Opportunities Right Now:`)
  console.log(LINE)

  if (ranked.length === 0) {
    console.log('  No yield data available — check RPC connectivity.')
  } else {
    ranked.slice(0, 10).forEach(e => {
      const medal  = e.rank === 1 ? '🏆' : `  ${e.rank}.`
      const name   = e.name.padEnd(30)
      const cat    = `[${e.category}]`.padEnd(10)
      const apy    = `${fmt(e.apy)}% APY`
      const tvlStr = e.tvl > 0 ? `  TVL: ${fmtTVL(e.tvl)}` : ''
      console.log(`${medal} ${name} ${cat} ${apy}${tvlStr}`)
    })
  }

  console.log(LINE)
  console.log(`Total opportunities found : ${ranked.length}`)
  console.log(`Protocols checked        : LSTs(${lsts.length}) Neverland(${lending.length}) Euler(${euler.length}) Morpho(${morpho.length}) Upshift(${upshift.length}) Gearbox(${gearbox.length})`)
  console.log(`Data fetched in          : ${elapsed}ms\n`)
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
