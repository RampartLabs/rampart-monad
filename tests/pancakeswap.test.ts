import { describe, it, expect } from 'vitest'
import { getPancakeSwapPools, getPancakeSwapPrice, getPancakeSwapTopPairs, PANCAKE_ADDRESSES } from '../src/protocols/pancakeswap'

describe('PancakeSwap V3 (Phase 3.1)', () => {
  it('PANCAKE_ADDRESSES has correct factory and quoter', () => {
    expect(PANCAKE_ADDRESSES.factory).toBe('0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865')
    expect(PANCAKE_ADDRESSES.quoterV2).toBe('0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997')
    expect(PANCAKE_ADDRESSES.smartRouter).toBe('0x21114915Ac6d5A2e156931e20B20b038dEd0Be7C')
  })

  it('getPancakeSwapPools returns an array', async () => {
    const pools = await getPancakeSwapPools()
    expect(Array.isArray(pools)).toBe(true)
    console.log(`  PancakeSwap V3 pools found: ${pools.length}`)
    pools.forEach(p => console.log(`    ${p.token0}/${p.token1} fee=${p.fee} @ ${p.address?.slice(0,10)}`))
  })

  it('getPancakeSwapPrice returns 0 for missing pools or valid price when pool exists', async () => {
    const price = await getPancakeSwapPrice('WMON', 'USDC')
    expect(price).toBeGreaterThanOrEqual(0)
    if (price > 0) {
      console.log(`  PancakeSwap WMON/USDC: $${price.toFixed(4)}`)
    } else {
      console.log('  PancakeSwap WMON/USDC: no pool yet (0)')
    }
  })

  it('getPancakeSwapTopPairs returns an array', async () => {
    const pairs = await getPancakeSwapTopPairs()
    expect(Array.isArray(pairs)).toBe(true)
    console.log(`  PancakeSwap top pairs: ${pairs.length}`)
    pairs.forEach(p => console.log(`    ${p.token0}/${p.token1} fee=${p.fee} liq=${p.liquidity}`))
  })
})
