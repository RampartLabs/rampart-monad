import { describe, it, expect } from 'vitest'
import { getLFJPools, getLFJPairCount, getLFJPairsForTokens, LFJ_ADDRESSES } from '../src/protocols/lfj'
import { getToken } from '../src/protocols/dex/tokens'

describe('LFJ / Trader Joe Liquidity Book (Phase 3.2)', () => {
  it('LFJ_ADDRESSES has correct factory and quoter', () => {
    expect(LFJ_ADDRESSES.factory).toBe('0xb43120c4745967fa9b93E79C149E66B0f2D6Fe0c')
    expect(LFJ_ADDRESSES.quoter).toBe('0x9A550a522BBaDFB69019b0432800Ed17855A51C3')
  })

  it('getLFJPairCount returns number of deployed pairs', async () => {
    const count = await getLFJPairCount()
    expect(count).toBeGreaterThanOrEqual(0)
    console.log(`  LFJ pairs deployed: ${count}`)
  })

  it('getLFJPools returns pool data with tokens and bin steps', async () => {
    const pools = await getLFJPools(10)
    expect(Array.isArray(pools)).toBe(true)
    console.log(`  LFJ pools fetched (max 10): ${pools.length}`)
    pools.slice(0, 5).forEach(p =>
      console.log(`    ${p.tokenX}/${p.tokenY} binStep=${p.binStep} price=${p.price.toFixed(4)} liquidity=${p.hasLiquidity}`)
    )
  })

  it('getLFJPairsForTokens returns pairs for WMON/USDC', async () => {
    const wmon = getToken('WMON')
    const usdc = getToken('USDC')
    const pairs = await getLFJPairsForTokens(wmon.address, usdc.address)
    expect(Array.isArray(pairs)).toBe(true)
    console.log(`  WMON/USDC LFJ pairs: ${pairs.length}`)
    pairs.forEach(p => console.log(`    binStep=${p.binStep} ignored=${p.ignoredForRouting}`))
  })
})
