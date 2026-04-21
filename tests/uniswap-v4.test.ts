import { describe, it, expect } from 'vitest'
import { getUniswapV4Pools, getUniswapV4Price, simulateUniswapV4Swap, computeV4PoolId, UNISWAP_V4_ADDRESSES } from '../src/protocols/uniswap-v4'
import { zeroAddress } from 'viem'
import { getToken } from '../src/protocols/dex/tokens'

describe('Uniswap V4 (Phase 3.4)', () => {
  it('UNISWAP_V4_ADDRESSES has correct contracts', () => {
    expect(UNISWAP_V4_ADDRESSES.poolManager).toBe('0x188d586ddcf52439676ca21a244753fa19f9ea8e')
    expect(UNISWAP_V4_ADDRESSES.quoter).toBe('0xa222dd357a9076d1091ed6aa2e16c9742dd26891')
    expect(UNISWAP_V4_ADDRESSES.positionManager).toBe('0x5b7ec4a94ff9bedb700fb82ab09d5846972f4016')
  })

  it('computeV4PoolId produces a 32-byte hex string', () => {
    const usdc = getToken('USDC')
    const id = computeV4PoolId({
      currency0: zeroAddress,
      currency1: usdc.address,
      fee: 3000,
      tickSpacing: 60,
      hooks: zeroAddress,
    })
    expect(id).toMatch(/^0x[0-9a-f]{64}$/)
    console.log(`  Pool ID (native/USDC 0.3%): ${id}`)
  })

  it('getUniswapV4Pools scans recent blocks for Initialize events', async () => {
    const pools = await getUniswapV4Pools(100)
    expect(Array.isArray(pools)).toBe(true)
    console.log(`  V4 pools found (last 100 blocks): ${pools.length}`)
    pools.slice(0, 3).forEach(p =>
      console.log(`    ${p.id.slice(0,12)} fee=${p.poolKey.fee} liquidity=${p.liquidity}`)
    )
  })

  it('getUniswapV4Price returns 0 or valid price for native MON / USDC', async () => {
    const usdc = getToken('USDC')
    const price = await getUniswapV4Price(zeroAddress, usdc.address, 1000000000000000000n)
    expect(price).toBeGreaterThanOrEqual(0)
    if (price > 0) {
      console.log(`  V4 price native MON → USDC: $${price.toFixed(4)}`)
    } else {
      console.log('  V4 price: no pool found (price = 0)')
    }
  })

  it('simulateUniswapV4Swap returns null or valid simulation', async () => {
    const usdc = getToken('USDC')
    const sim = await simulateUniswapV4Swap(zeroAddress, usdc.address, 1000000000000000000n)
    if (sim) {
      expect(sim.amountIn).toBeGreaterThan(0n)
      expect(sim.amountOut).toBeGreaterThan(0n)
      console.log(`  V4 swap simulation: 1 MON → ${(Number(sim.amountOut)/1e6).toFixed(4)} USDC fee=${sim.poolKey.fee}`)
    } else {
      console.log('  V4 swap simulation: no route found')
    }
  })
})
