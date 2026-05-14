/**
 * @module Uniswap
 * @description Uniswap V3 on Monad Mainnet — concentrated liquidity AMM.
 *
 * **TVL:** ~$200K
 * **Type:** AMM (V3)
 * **Docs:** https://docs.uniswap.org
 *
 * Available functions:
 * - {@link getUniswapPools} — discovers pools via Factory (seed pairs × fee tiers)
 * - {@link getUniswapPrice} — best price via QuoterV2 across all fee tiers
 * - {@link compareWithKuru} — spread between Uniswap V3 and Kuru
 * - {@link getUniswapTVL} — estimated TVL across all discovered pools
 */

import { publicClient } from '../chain'
import { getToken } from './dex/tokens'
import { getTokenPrice, getOrderbook } from './kuru'
import type { Pool, PriceComparison } from '../types'

const UNI_V3_FACTORY:  `0x${string}` = '0x204faca1764b154221e35c0d20abb3c525710498'
const UNI_QUOTER_V2:   `0x${string}` = '0x661e93cca42afacb172121ef892830ca3b70f08d'

export const UNISWAP_V3_ADDRESSES = {
  factory:                   UNI_V3_FACTORY,
  swapRouter02:              '0xfe31f71c1b106eac32f1a19239c9a9a72ddfb900' as `0x${string}`,
  quoterV2:                  UNI_QUOTER_V2,
  nonfungiblePositionManager:'0x7197e214c0b767cfb76fb734ab638e2c192f4e53' as `0x${string}`,
}

const FEE_TIERS = [100, 500, 3000, 10000] as const

const FACTORY_ABI = [{
  name: 'getPool',
  type: 'function' as const,
  stateMutability: 'view' as const,
  inputs: [
    { name: 'tokenA', type: 'address' },
    { name: 'tokenB', type: 'address' },
    { name: 'fee',    type: 'uint24'  },
  ],
  outputs: [{ name: 'pool', type: 'address' }],
}] as const

const QUOTER_V2_ABI = [{
  name: 'quoteExactInputSingle',
  type: 'function' as const,
  stateMutability: 'nonpayable' as const,
  inputs: [{
    type: 'tuple',
    components: [
      { name: 'tokenIn',           type: 'address' },
      { name: 'tokenOut',          type: 'address' },
      { name: 'amountIn',          type: 'uint256' },
      { name: 'fee',               type: 'uint24'  },
      { name: 'sqrtPriceLimitX96', type: 'uint160' },
    ],
  }],
  outputs: [
    { name: 'amountOut',              type: 'uint256' },
    { name: 'sqrtPriceX96After',      type: 'uint160' },
    { name: 'initializedTicksCrossed',type: 'uint32'  },
    { name: 'gasEstimate',            type: 'uint256' },
  ],
}] as const

const POOL_ABI = [
  {
    name: 'slot0',
    type: 'function' as const,
    stateMutability: 'view' as const,
    inputs: [],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick',         type: 'int24'   },
      { name: 'observationIndex', type: 'uint16' },
      { name: 'observationCardinality', type: 'uint16' },
      { name: 'observationCardinalityNext', type: 'uint16' },
      { name: 'feeProtocol', type: 'uint8' },
      { name: 'unlocked', type: 'bool' },
    ],
  },
  {
    name: 'liquidity',
    type: 'function' as const,
    stateMutability: 'view' as const,
    inputs: [],
    outputs: [{ type: 'uint128' }],
  },
] as const

export interface UniswapV3Pool {
  address:   string
  token0:    string
  token1:    string
  fee:       number
  liquidity: bigint
  sqrtPrice: bigint
  tick:      number
  unlocked:  boolean
}

const SEED_PAIRS: Array<[string, string]> = [
  ['MON', 'USDC'],
  ['MON', 'USDT0'],
  ['MON', 'WETH'],
  ['MON', 'WBTC'],
  ['MON', 'AUSD'],
  ['MON', 'shMON'],
  ['MON', 'gMON'],
  ['MON', 'sMON'],
  ['USDC', 'USDT0'],
  ['WETH', 'USDC'],
  ['WBTC', 'USDC'],
  ['WETH', 'WBTC'],
  ['USDC', 'AUSD'],
]

/**
 * Discovers Uniswap V3 pools by probing the factory for known token pairs across all fee tiers.
 *
 * @returns Array of {@link Pool} for every found pool
 *
 * @example
 * ```typescript
 * const pools = await getUniswapPools()
 * // → [{ protocol: 'uniswap', address: '0x...', token0: 'WMON', token1: 'USDC', fee: 0.003 }]
 * ```
 *
 * @category DEX
 */
export async function getUniswapPools(): Promise<Pool[]> {
  const pools: Pool[] = []

  await Promise.allSettled(
    SEED_PAIRS.flatMap(([symA, symB]) =>
      FEE_TIERS.map(async fee => {
        try {
          const tA = getToken(symA)
          const tB = getToken(symB)
          const addr = await publicClient.readContract({
            address:      UNI_V3_FACTORY,
            abi:          FACTORY_ABI,
            functionName: 'getPool',
            args:         [tA.address, tB.address, fee],
          }) as `0x${string}`
          if (!addr || addr === '0x0000000000000000000000000000000000000000') return

          const [slot0Raw, liquidityRaw] = await Promise.all([
            publicClient.readContract({ address: addr, abi: POOL_ABI, functionName: 'slot0' }).catch(() => null),
            publicClient.readContract({ address: addr, abi: POOL_ABI, functionName: 'liquidity' }).catch(() => 0n),
          ])
          const s0 = slot0Raw as { sqrtPriceX96: bigint; tick: number; unlocked: boolean } | null
          if (!s0 || s0.sqrtPriceX96 === 0n) return

          pools.push({
            protocol: 'uniswap',
            address:  addr,
            token0:   symA,
            token1:   symB,
            fee:      fee / 1_000_000,
          })
        } catch {
          // pool doesn't exist for this fee tier
        }
      })
    )
  )

  return pools
}

/**
 * Returns the best price for a token pair across all Uniswap V3 fee tiers via QuoterV2.
 *
 * @param tokenIn  - Input token symbol (e.g. `'WMON'`)
 * @param tokenOut - Output token symbol (e.g. `'USDC'`)
 * @param amountIn - Raw input amount (defaults to 1 full token)
 * @returns Best output amount in human-readable units, or `0` if no pool
 *
 * @example
 * ```typescript
 * const price = await getUniswapPrice('WMON', 'USDC')
 * // → 0.354
 * ```
 *
 * @category DEX
 */
export async function getUniswapPrice(
  tokenIn:   string,
  tokenOut = 'USDC',
  amountIn?: bigint,
): Promise<number> {
  try {
    const tIn  = getToken(tokenIn)
    const tOut = getToken(tokenOut)
    const amt  = amountIn ?? BigInt(10 ** tIn.decimals)

    const results = await Promise.allSettled(
      FEE_TIERS.map(fee =>
        publicClient.simulateContract({
          address:      UNI_QUOTER_V2,
          abi:          QUOTER_V2_ABI,
          functionName: 'quoteExactInputSingle',
          args: [{ tokenIn: tIn.address, tokenOut: tOut.address, amountIn: amt, fee, sqrtPriceLimitX96: 0n }],
        })
      )
    )

    let bestOut = 0n
    for (const r of results) {
      if (r.status !== 'fulfilled') continue
      const [amountOut] = r.value.result as [bigint, bigint, number, bigint]
      if (amountOut > bestOut) bestOut = amountOut
    }

    if (bestOut === 0n) return 0
    return Number(bestOut) / 10 ** tOut.decimals
  } catch {
    return 0
  }
}

/**
 * Compares the best Uniswap V3 price with the Kuru CLOB price for a token pair.
 *
 * @param token      - Base token symbol (e.g. `'WMON'`)
 * @param quoteAsset - Quote token symbol (default `'USDC'`)
 * @param amountIn   - Raw input amount in base token units (defaults to 1 token)
 * @returns {@link PriceComparison} with `kuru`, `uniswap`, `spread`, `spreadPct`, and `best`
 *
 * @example
 * ```typescript
 * const cmp = await compareWithKuru('WMON')
 * // → { token: 'WMON', kuru: 0.0312, uniswap: 0.0310, spread: 0.0002, spreadPct: 0.645, best: 'kuru' }
 * ```
 *
 * @category DEX
 */
export async function compareWithKuru(
  token:      string,
  quoteAsset = 'USDC',
  amountIn?:  bigint,
): Promise<PriceComparison> {
  const [uniPrice, kuruResult] = await Promise.all([
    getUniswapPrice(token, quoteAsset, amountIn),
    getTokenPrice(token, quoteAsset).catch(async () => {
      const ob = await getOrderbook(`${token}_${quoteAsset}`).catch(() => null)
      return ob ? { price: ob.midPrice } : { price: 0 }
    }),
  ])

  const kuruPrice = kuruResult.price
  const spread    = Math.abs(uniPrice - kuruPrice)
  const base      = Math.min(uniPrice, kuruPrice)
  const spreadPct = base > 0 ? (spread / base) * 100 : 0

  const best: 'kuru' | 'uniswap' =
    uniPrice === 0   ? 'kuru'
    : kuruPrice === 0 ? 'uniswap'
    : kuruPrice < uniPrice ? 'kuru' : 'uniswap'

  return { token, kuru: kuruPrice, uniswap: uniPrice, spread, spreadPct, best }
}

/**
 * Returns estimated TVL across all discovered Uniswap V3 pools on Monad.
 * Uses sqrtPriceX96 × liquidity approximation — best-effort, not protocol-exact.
 *
 * @returns TVL in USD (approximate)
 *
 * @category DEX
 */
export async function getUniswapTVL(): Promise<number> {
  try {
    const pools: UniswapV3Pool[] = []

    await Promise.allSettled(
      SEED_PAIRS.flatMap(([symA, symB]) =>
        FEE_TIERS.map(async fee => {
          try {
            const tA = getToken(symA)
            const tB = getToken(symB)
            const addr = await publicClient.readContract({
              address:      UNI_V3_FACTORY,
              abi:          FACTORY_ABI,
              functionName: 'getPool',
              args:         [tA.address, tB.address, fee],
            }) as `0x${string}`
            if (!addr || addr === '0x0000000000000000000000000000000000000000') return

            const [slot0Raw, liquidityRaw] = await Promise.all([
              publicClient.readContract({ address: addr, abi: POOL_ABI, functionName: 'slot0' }).catch(() => null),
              publicClient.readContract({ address: addr, abi: POOL_ABI, functionName: 'liquidity' }).catch(() => 0n),
            ])
            const s0 = slot0Raw as { sqrtPriceX96: bigint; tick: number; unlocked: boolean } | null
            if (!s0 || s0.sqrtPriceX96 === 0n) return

            pools.push({
              address:   addr,
              token0:    symA,
              token1:    symB,
              fee,
              liquidity:  liquidityRaw as bigint,
              sqrtPrice:  s0.sqrtPriceX96,
              tick:       s0.tick,
              unlocked:   s0.unlocked,
            })
          } catch {
            // no pool
          }
        })
      )
    )

    let tvl = 0
    for (const pool of pools) {
      if (pool.sqrtPrice === 0n || pool.liquidity === 0n) continue
      const tA = getToken(pool.token0)
      const tB = getToken(pool.token1)
      const p  = Number(pool.sqrtPrice) / 2 ** 96
      const price = p * p * (10 ** tA.decimals) / (10 ** tB.decimals)
      const liq   = Number(pool.liquidity)
      const token0Amount = liq / Math.sqrt(price)
      const token1Amount = liq * Math.sqrt(price)

      const token0USD = ['USDC', 'USDT0', 'AUSD'].includes(pool.token0)
        ? token0Amount / (10 ** tA.decimals)
        : (await getTokenPrice(pool.token0, 'USDC').catch(() => ({ price: 0 }))).price * (token0Amount / (10 ** tA.decimals))

      const token1USD = ['USDC', 'USDT0', 'AUSD'].includes(pool.token1)
        ? token1Amount / (10 ** tB.decimals)
        : 0

      tvl += token0USD + token1USD
    }

    return tvl
  } catch {
    return 0
  }
}
