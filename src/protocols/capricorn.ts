/**
 * @module Capricorn
 * @description Capricorn Finance concentrated liquidity DEX on Monad.
 * A Uniswap V3 fork with custom init-code hash. Supports 500, 3000, and 10000 bps
 * fee tiers. Price simulation uses QuoterV2 via `simulateContract`.
 *
 * **TVL:** ~$500K
 * **Type:** Concentrated Liquidity DEX (Uniswap V3 fork)
 * **Docs:** https://capricorn.finance
 *
 * Available functions:
 * - {@link getCapricornPools} — all Capricorn concentrated liquidity pools
 * - {@link getCapricornPrice} — best price via QuoterV2 simulation
 */

// ============================================================
// Rampart SDK — Capricorn Finance on Monad
// Concentrated liquidity AMM (Uniswap V3 fork).
// Source: github.com/monad-crypto/protocols/mainnet/capricorn.jsonc
// ============================================================

import { publicClient } from '../chain'
import { getToken } from './dex/tokens'

export const CAPRICORN_ADDRESSES = {
  Factory:            '0x6B5F564339DbAD6b780249827f2198a841FEB7F3' as `0x${string}`,
  SwapRouter:         '0xdac97b6a3951641B177283028A8f428332333071' as `0x${string}`,
  QuoterV2:           '0xB430EDD2b54cdB3B25703fb3342ca3a88663A04D' as `0x${string}`,
  PositionManager:    '0x4C02af995BB1f574c9bf31F43ddc112414aE0Ac7' as `0x${string}`,
  PositionDescriptor: '0xEd2850D3704a1a5BcB6158f27deDA3d6FF4C31D9' as `0x${string}`,
} as const

const FACTORY_ABI = [
  {
    name: 'getPool',
    type: 'function' as const,
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'fee',    type: 'uint24'  },
    ],
    outputs: [{ type: 'address' }],
    stateMutability: 'view' as const,
  },
] as const

const POOL_ABI = [
  {
    name: 'slot0',
    type: 'function' as const,
    inputs: [],
    outputs: [
      { name: 'sqrtPriceX96',        type: 'uint160' },
      { name: 'tick',                type: 'int24'   },
      { name: 'observationIndex',    type: 'uint16'  },
      { name: 'observationCardinality', type: 'uint16' },
      { name: 'observationCardinalityNext', type: 'uint16' },
      { name: 'feeProtocol',         type: 'uint8'   },
      { name: 'unlocked',            type: 'bool'    },
    ],
    stateMutability: 'view' as const,
  },
  { name: 'liquidity', type: 'function' as const, inputs: [], outputs: [{ type: 'uint128' }], stateMutability: 'view' as const },
  { name: 'token0',    type: 'function' as const, inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
  { name: 'token1',    type: 'function' as const, inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
] as const

// Quoter V2 for price simulation
const QUOTER_V2_ABI = [
  {
    name: 'quoteExactInputSingle',
    type: 'function' as const,
    inputs: [
      {
        type: 'tuple',
        components: [
          { name: 'tokenIn',           type: 'address' },
          { name: 'tokenOut',          type: 'address' },
          { name: 'amountIn',          type: 'uint256' },
          { name: 'fee',               type: 'uint24'  },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
      },
    ],
    outputs: [
      { name: 'amountOut',            type: 'uint256' },
      { name: 'sqrtPriceX96After',    type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate',          type: 'uint256' },
    ],
    stateMutability: 'nonpayable' as const,
  },
] as const

export interface CapricornPool {
  token0:        string
  token1:        string
  fee:           number
  address:       string
  liquidity:     bigint
  sqrtPriceX96:  bigint   // current sqrt price in Q96
  tick:          number   // current tick
  unlocked:      boolean  // reentrancy lock status
  protocol:      'capricorn'
}

const FEE_TIERS    = [500, 3000, 10000] as const
const SEED_PAIRS: [string, string][] = [
  ['WMON', 'USDC'], ['WMON', 'USDT'], ['WMON', 'WETH'],
  ['WMON', 'AUSD'], ['WETH', 'USDC'], ['WBTC', 'USDC'],
]

/**
 * Returns all Capricorn Finance concentrated liquidity pools on Monad.
 *
 * Probes well-known token pairs across all three fee tiers (500, 3000, 10000 bps)
 * via the factory's `getPool` function and returns pools with non-zero addresses.
 *
 * @returns Array of {@link CapricornPool} objects with token pair, fee tier, address, and liquidity
 *
 * @example
 * ```typescript
 * const pools = await getCapricornPools()
 * // → [{ token0: 'WMON', token1: 'USDC', fee: 3000, liquidity: 1500000000n, ... }, ...]
 * ```
 *
 * @category DEX
 */
export async function getCapricornPools(): Promise<CapricornPool[]> {
  const results: CapricornPool[] = []

  for (const [symA, symB] of SEED_PAIRS) {
    let addrA: `0x${string}`, addrB: `0x${string}`
    try { addrA = getToken(symA).address; addrB = getToken(symB).address } catch { continue }

    for (const fee of FEE_TIERS) {
      const poolAddr = await publicClient.readContract({
        address: CAPRICORN_ADDRESSES.Factory,
        abi: FACTORY_ABI,
        functionName: 'getPool',
        args: [addrA, addrB, fee],
      }).catch(() => null) as `0x${string}` | null

      if (!poolAddr || poolAddr === '0x0000000000000000000000000000000000000000') continue

      const [liquidity, slot0] = await Promise.all([
        publicClient.readContract({ address: poolAddr, abi: POOL_ABI, functionName: 'liquidity' }).catch(() => 0n),
        publicClient.readContract({ address: poolAddr, abi: POOL_ABI, functionName: 'slot0' }).catch(() => null),
      ])
      const s0 = slot0 as any

      results.push({
        token0: symA, token1: symB, fee, address: poolAddr,
        liquidity:    liquidity as bigint,
        sqrtPriceX96: s0?.sqrtPriceX96 ?? 0n,
        tick:         s0?.tick          ?? 0,
        unlocked:     s0?.unlocked      ?? false,
        protocol: 'capricorn',
      })
    }
  }

  return results
}

/**
 * Returns the best swap price from Capricorn for a given token pair using QuoterV2 simulation.
 *
 * Tries all supported fee tiers and returns the first non-zero price (tokenOut units per 1 tokenIn).
 * Uses `simulateContract` because QuoterV2 is non-view.
 *
 * @param tokenIn  - Input token symbol (e.g. `'WMON'`)
 * @param tokenOut - Output token symbol (e.g. `'USDC'`)
 * @returns Price as tokenOut per 1 tokenIn, or `0` if no pool or quote available
 *
 * @example
 * ```typescript
 * const price = await getCapricornPrice('WMON', 'USDC')
 * // → 0.354
 * ```
 *
 * @category DEX
 */
export async function getCapricornPrice(tokenIn: string, tokenOut: string): Promise<number> {
  let inAddr: `0x${string}`, outAddr: `0x${string}`
  try { inAddr = getToken(tokenIn).address; outAddr = getToken(tokenOut).address } catch { return 0 }

  const inDecimals  = getToken(tokenIn).decimals  ?? 18
  const outDecimals = getToken(tokenOut).decimals ?? 6
  const amountIn    = BigInt(10 ** inDecimals)  // 1 unit

  for (const fee of FEE_TIERS) {
    const result = await publicClient.simulateContract({
      address: CAPRICORN_ADDRESSES.QuoterV2,
      abi: QUOTER_V2_ABI,
      functionName: 'quoteExactInputSingle',
      args: [{ tokenIn: inAddr, tokenOut: outAddr, amountIn, fee, sqrtPriceLimitX96: 0n }],
    }).catch(() => null)

    if (result?.result) {
      const [amountOut] = result.result as unknown as [bigint, ...unknown[]]
      const price = Number(amountOut) / (10 ** outDecimals)
      if (price > 0) return price
    }
  }

  return 0
}
