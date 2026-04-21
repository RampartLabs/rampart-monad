import { describe, it, expect } from 'vitest'
import { getEulerVaults, getEulerBestSupply, getEulerTVL } from '../src/protocols/euler'

describe('Euler V2 Lending (Phase 11)', () => {
  it('getEulerVaults returns active vaults', async () => {
    const vaults = await getEulerVaults(20)
    expect(vaults.length).toBeGreaterThan(0)
    for (const v of vaults) {
      expect(v.totalAssets).toBeGreaterThan(0)
      expect(v.protocol).toBe('euler')
      expect(v.address).toMatch(/^0x/)
    }
    console.log(`  Found ${vaults.length} active vaults`)
    console.log('  Top 5 by TVL:')
    vaults.slice(0, 5).forEach(v =>
      console.log(`    ${v.vaultSymbol.padEnd(16)} asset=${v.assetSymbol.padEnd(8)} TVL=${v.totalAssets.toLocaleString()} borrowAPR=${(v.borrowAPR*100).toFixed(2)}% util=${(v.utilizationRate*100).toFixed(1)}%`)
    )
  }, 60_000)

  it('vaults sorted by totalAssets descending', async () => {
    const vaults = await getEulerVaults(20)
    for (let i = 1; i < vaults.length; i++) {
      expect(vaults[i].totalAssets).toBeLessThanOrEqual(vaults[i-1].totalAssets)
    }
  }, 60_000)

  it('getEulerBestSupply returns vault with highest supplyAPY', async () => {
    const best = await getEulerBestSupply()
    expect(best.supplyAPY).toBeGreaterThanOrEqual(0)
    expect(best.protocol).toBe('euler')
    console.log(`  Best supply: ${best.vaultSymbol} (${best.assetSymbol}) @ ${(best.supplyAPY*100).toFixed(2)}% APY`)
    console.log(`    borrowAPR=${(best.borrowAPR*100).toFixed(2)}% util=${(best.utilizationRate*100).toFixed(1)}% TVL=${best.totalAssets.toLocaleString()}`)
  }, 60_000)

  it('getEulerTVL returns USD-denominated stable TVL', async () => {
    const tvl = await getEulerTVL()
    expect(tvl).toBeGreaterThan(0)
    console.log(`  Euler stable TVL: $${tvl.toLocaleString()}`)
  }, 60_000)

  it('vaults have valid utilization rates', async () => {
    const vaults = await getEulerVaults(20)
    for (const v of vaults) {
      expect(v.utilizationRate).toBeGreaterThanOrEqual(0)
      expect(v.utilizationRate).toBeLessThanOrEqual(1.01)
      expect(v.supplyAPY).toBeGreaterThanOrEqual(0)
    }
  }, 60_000)
})
