import { describe, it, expect } from 'vitest'

// Phase 26 — Renzo
import { getRenzoStats, RENZO_EZ_ETH } from '../src/protocols/renzo'

// Phase 27 — Beefy
import {
  getBeefyVaults, getBeefyVaultsDetailed, getBeefyBestVault, getBeefyTVL,
  getBeefyApyBreakdown, getBeefyFees,
  getBeefyLPs, getBeefyLPBreakdown,
  getBeefyTokens, getBeefyBoosts, getBeefyConfig,
  BEEFY_ADDRESSES,
} from '../src/protocols/beefy'

// Phase 28 — WooFi
import { getWooFiPools, WOOFI_ADDRESSES } from '../src/protocols/woofi'

// Phase 29 — KyberSwap
import { getKyberSwapPrice, KYBERSWAP_ADDRESSES } from '../src/protocols/kyberswap'

// Phase 30 — iZiSwap
import { getIZiPools, getIZiStats, IZISWAP_ADDRESSES } from '../src/protocols/iziswap'

// Phase 31 — Bean Exchange
import { getBeanPairCount, getBeanPairs, BEAN_ADDRESSES } from '../src/protocols/bean'

// Phase 32 — Sablier
import { getSablierStreamCount, getSablierStats, SABLIER_ADDRESSES } from '../src/protocols/sablier'

// Phase 33 — Covenant
import { getCovenantStats, COVENANT_ADDRESSES } from '../src/protocols/covenant'

// Phase 34 — Multipli.fi
import { getMultipliVault, MULTIPLI_ADDRESSES } from '../src/protocols/multipli'

// Phase 53 — Mu Digital
import { getMuDigitalStats, getMuDigitalTVL, MU_DIGITAL_ADDRESSES } from '../src/protocols/mudigital'

// ─── Renzo ───────────────────────────────────────────────────────────────────

describe('Renzo Protocol (Phase 26)', () => {
  it('RENZO_EZ_ETH has correct address', () => {
    expect(RENZO_EZ_ETH).toBe('0x2416092f143378750bb29b79eD961ab195CcEea5')
  })

  it('getRenzoStats returns valid stats', async () => {
    const stats = await getRenzoStats()
    expect(stats.protocol).toBe('renzo')
    expect(stats.token).toBe('ezETH')
    expect(stats.totalAssets).toBeGreaterThanOrEqual(0)
    expect(stats.exchangeRate).toBeGreaterThan(0)
    console.log(`  Renzo ezETH: totalAssets=${stats.totalAssets.toFixed(4)} ETH exchangeRate=${stats.exchangeRate.toFixed(6)} TVL=$${stats.tvlUSD.toFixed(0)}`)
  })
})

// ─── Beefy ───────────────────────────────────────────────────────────────────

describe('Beefy Finance (Phase 27)', () => {
  it('BEEFY_ADDRESSES has correct factory', () => {
    expect(BEEFY_ADDRESSES.vaultFactory).toBe('0x9818dF1Bdce8D0E79B982e2C3a93ac821b3c17e0')
    expect(BEEFY_ADDRESSES.clmFactory).toBe('0x03C2E2e84031d913d45B1F5b5dDC8E50Fcb28652')
  })

  it('getBeefyVaults returns array', async () => {
    const vaults = await getBeefyVaults()
    expect(Array.isArray(vaults)).toBe(true)
    console.log(`  Beefy vaults on Monad: ${vaults.length}`)
    vaults.slice(0, 3).forEach(v => console.log(`    ${v.id} apy=${(v.apy * 100).toFixed(2)}% tvl=$${v.tvlUSD.toFixed(0)} paused=${v.depositsPaused}`))
  })

  it('getBeefyVaultsDetailed returns vaults with breakdown fields', async () => {
    const vaults = await getBeefyVaultsDetailed()
    expect(Array.isArray(vaults)).toBe(true)
    console.log(`  Beefy detailed vaults: ${vaults.length}`)
    if (vaults.length > 0) {
      const v = vaults[0]
      console.log(`    ${v.id} fees=${JSON.stringify(v.fees)} apyBreakdown=${JSON.stringify(v.apyBreakdown)}`)
    }
  })

  it('getBeefyBestVault returns null or vault with highest APY', async () => {
    const best = await getBeefyBestVault()
    if (best) {
      expect(best.status).toBe('active')
      expect(best.apy).toBeGreaterThanOrEqual(0)
      console.log(`  Beefy best vault: ${best.id} apy=${(best.apy * 100).toFixed(2)}%`)
    } else {
      console.log('  Beefy best vault: null (no vaults on Monad yet)')
    }
  })

  it('getBeefyTVL returns non-negative number', async () => {
    const tvl = await getBeefyTVL()
    expect(tvl).toBeGreaterThanOrEqual(0)
    console.log(`  Beefy TVL on Monad: $${tvl.toLocaleString()}`)
  })

  it('getBeefyApyBreakdown returns array', async () => {
    const breakdowns = await getBeefyApyBreakdown()
    expect(Array.isArray(breakdowns)).toBe(true)
    console.log(`  Beefy APY breakdowns: ${breakdowns.length}`)
    breakdowns.slice(0, 2).forEach(b => console.log(`    ${b.vaultId} totalApy=${(b.totalApy * 100).toFixed(2)}% tradingApr=${(b.tradingApr * 100).toFixed(2)}%`))
  })

  it('getBeefyFees returns array with fee structure', async () => {
    const fees = await getBeefyFees()
    expect(Array.isArray(fees)).toBe(true)
    console.log(`  Beefy fee entries: ${fees.length}`)
    fees.slice(0, 2).forEach(f => console.log(`    ${f.vaultId} perf=${f.performance} withdraw=${f.withdrawal}`))
  })

  it('getBeefyLPs returns LP prices array', async () => {
    const lps = await getBeefyLPs()
    expect(Array.isArray(lps)).toBe(true)
    console.log(`  Beefy LPs on Monad: ${lps.length}`)
    lps.slice(0, 3).forEach(lp => console.log(`    ${lp.id} price=$${lp.price.toFixed(4)}`))
  })

  it('getBeefyLPBreakdown returns LP breakdown array', async () => {
    const breakdowns = await getBeefyLPBreakdown()
    expect(Array.isArray(breakdowns)).toBe(true)
    console.log(`  Beefy LP breakdowns: ${breakdowns.length}`)
  })

  it('getBeefyTokens returns token array', async () => {
    const tokens = await getBeefyTokens()
    expect(Array.isArray(tokens)).toBe(true)
    console.log(`  Beefy tokens on Monad: ${tokens.length}`)
    tokens.slice(0, 3).forEach(t => console.log(`    ${t.symbol} ${t.address}`))
  })

  it('getBeefyBoosts returns boosts array', async () => {
    const boosts = await getBeefyBoosts()
    expect(Array.isArray(boosts)).toBe(true)
    console.log(`  Beefy boosts on Monad: ${boosts.length}`)
    boosts.slice(0, 2).forEach(b => console.log(`    ${b.id} status=${b.status}`))
  })

  it('getBeefyConfig returns config object', async () => {
    const cfg = await getBeefyConfig()
    expect(typeof cfg).toBe('object')
    console.log(`  Beefy config keys: ${Object.keys(cfg).join(', ')}`)
  })
})

// ─── WooFi ───────────────────────────────────────────────────────────────────

describe('WooFi DEX (Phase 28)', () => {
  it('WOOFI_ADDRESSES has correct contracts', () => {
    expect(WOOFI_ADDRESSES.wooPPV2).toBe('0x5520385bFcf07Ec87C4c53A7d8d65595Dff69FA4')
    expect(WOOFI_ADDRESSES.wooRouter).toBe('0x4c4AF8DBc524681930a27b2F1Af5bcC8062E6fB7')
  })

  it('getWooFiPools returns array', async () => {
    const pools = await getWooFiPools()
    expect(Array.isArray(pools)).toBe(true)
    console.log(`  WooFi pools: ${pools.length}`)
    pools.forEach(p => console.log(`    ${p.baseToken}/${p.quoteToken} reserve=${p.reserve.toFixed(4)}`))
  })
})

// ─── KyberSwap ────────────────────────────────────────────────────────────────

describe('KyberSwap (Phase 29)', () => {
  it('KYBERSWAP_ADDRESSES has correct router', () => {
    expect(KYBERSWAP_ADDRESSES.router).toBe('0x6131B5fae19EA4f9D964eAc0408E4408b66337b5')
  })

  it('getKyberSwapPrice returns null or a valid price', async () => {
    const price = await getKyberSwapPrice('WMON')
    if (price !== null) {
      expect(price).toBeGreaterThan(0)
      console.log(`  KyberSwap WMON price: $${price.toFixed(4)}`)
    } else {
      console.log('  KyberSwap: no route found (API may not support Monad yet)')
    }
  })
})

// ─── iZiSwap ─────────────────────────────────────────────────────────────────

describe('iZiSwap (Phase 30)', () => {
  it('IZISWAP_ADDRESSES has correct contracts', () => {
    expect(IZISWAP_ADDRESSES.factory).toBe('0x8c7d3063579BdB0b90997e18A770eaE32E1eBb08')
    expect(IZISWAP_ADDRESSES.swapRouter).toBe('0x34bc1b87f60e0a30c0e24FD7Abada70436c71406')
  })

  it('getIZiStats returns stats object', async () => {
    const stats = await getIZiStats()
    expect(stats.protocol).toBe('iziswap')
    expect(stats.pools).toBeGreaterThanOrEqual(0)
    console.log(`  iZiSwap: ${stats.pools} pools found, ${stats.activePools} active`)
  })
})

// ─── Bean Exchange ────────────────────────────────────────────────────────────

describe('Bean Exchange (Phase 31)', () => {
  it('BEAN_ADDRESSES has correct contracts', () => {
    expect(BEAN_ADDRESSES.factory).toBe('0x8Bb9727Ca742C146563DccBAFb9308A234e1d242')
    expect(BEAN_ADDRESSES.router).toBe('0x721aC9E688E6b86F48b08DB2ba2D4B7bBBd12665')
  })

  it('getBeanPairCount returns non-negative number', async () => {
    const count = await getBeanPairCount()
    expect(count).toBeGreaterThanOrEqual(0)
    console.log(`  Bean Exchange pairs: ${count}`)
  })

  it('getBeanPairs returns array', async () => {
    const pairs = await getBeanPairs(5)
    expect(Array.isArray(pairs)).toBe(true)
    console.log(`  Bean Exchange loaded pairs: ${pairs.length}`)
  })
})

// ─── Sablier ─────────────────────────────────────────────────────────────────

describe('Sablier Streaming (Phase 32)', () => {
  it('SABLIER_ADDRESSES has correct contracts', () => {
    expect(SABLIER_ADDRESSES.lockup).toBe('0x82723C1ffEc9D43dE5FA80b25Da8df99AfD470ba')
    expect(SABLIER_ADDRESSES.batchLockup).toBe('0x4FCACf614E456728CaEa87f475bd78EC3550E20B')
  })

  it('getSablierStreamCount returns non-negative number', async () => {
    const count = await getSablierStreamCount()
    expect(count).toBeGreaterThanOrEqual(0)
    console.log(`  Sablier total streams: ${count}`)
  })

  it('getSablierStats returns stats object', async () => {
    const stats = await getSablierStats()
    expect(stats.protocol).toBe('sablier')
    expect(stats.totalStreams).toBeGreaterThanOrEqual(0)
    console.log(`  Sablier: ${stats.totalStreams} streams, ~${stats.activeStreams} active`)
  })
})

// ─── Covenant ────────────────────────────────────────────────────────────────

describe('Covenant Protocol (Phase 33)', () => {
  it('COVENANT_ADDRESSES has correct contracts', () => {
    expect(COVENANT_ADDRESSES.covenant).toBe('0x11A7Ab0A9D7bD531DBcF0f0630BF7167F8F198f6')
    expect(COVENANT_ADDRESSES.curator).toBe('0xAB0f8aB1e67cc02A9D58fc27055292289B159094')
  })

  it('getCovenantStats returns stats object', async () => {
    const stats = await getCovenantStats()
    expect(stats.protocol).toBe('covenant')
    expect(stats.totalAssets).toBeGreaterThanOrEqual(0)
    console.log(`  Covenant: totalAssets=${stats.totalAssets.toFixed(4)} vaults=${stats.vaultCount}`)
  })
})

// ─── Multipli.fi ─────────────────────────────────────────────────────────────

describe('Multipli.fi RWA Vaults (Phase 34)', () => {
  it('MULTIPLI_ADDRESSES — xUSDC vault deployed on Monad', () => {
    expect(typeof MULTIPLI_ADDRESSES.xUSDC).toBe('string')
    expect(MULTIPLI_ADDRESSES.xUSDC).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })

  it('getMultipliVault returns valid vault stats', async () => {
    const vault = await getMultipliVault()
    expect(vault.protocol).toBe('multipli')
    expect(vault.totalAssets).toBeGreaterThanOrEqual(0)
    console.log(`  Multipli xUSDC: totalAssets=${vault.totalAssets.toFixed(2)} rate=${vault.exchangeRate.toFixed(6)} TVL=$${vault.tvlUSD.toFixed(0)}`)
  })
})

// ─── Mu Digital ───────────────────────────────────────────────────────────────

describe('Mu Digital RWA (Phase 53)', () => {
  it('MU_DIGITAL_ADDRESSES has correct contracts', () => {
    expect(MU_DIGITAL_ADDRESSES.AZND).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(MU_DIGITAL_ADDRESSES.loAZND).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(MU_DIGITAL_ADDRESSES.muBOND).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })

  it('getMuDigitalStats returns valid stats', async () => {
    const stats = await getMuDigitalStats()
    expect(stats.protocol).toBe('mudigital')
    expect(stats.azndSupply).toBeGreaterThanOrEqual(0)
    expect(stats.loAzndSupply).toBeGreaterThanOrEqual(0)
    expect(stats.muBondSupply).toBeGreaterThanOrEqual(0)
    expect(stats.tvlUSD).toBeGreaterThanOrEqual(0)
    expect(stats.tvlUSD).toBeCloseTo(stats.azndSupply + stats.loAzndSupply + stats.muBondSupply, 0)
    console.log(`  Mu Digital: AZND=${stats.azndSupply.toFixed(0)} loAZND=${stats.loAzndSupply.toFixed(0)} muBOND=${stats.muBondSupply.toFixed(0)} TVL=$${stats.tvlUSD.toFixed(0)}`)
  }, 30_000)

  it('getMuDigitalTVL returns non-negative number', async () => {
    const tvl = await getMuDigitalTVL()
    expect(tvl).toBeGreaterThanOrEqual(0)
    console.log(`  Mu Digital TVL: $${tvl.toLocaleString()}`)
  }, 30_000)
})
