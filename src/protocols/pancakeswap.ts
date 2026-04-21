/**
 * @module PancakeSwap
 * @description PancakeSwap V3 AMM pools on Monad Mainnet.
 * A Uniswap V3 fork sharing the same ABI with different deployed addresses.
 * Pools are discovered by probing the factory for known token pairs across all
 * five fee tiers; quotes use QuoterV2 via `simulateContract` (non-view).
 *
 * **TVL:** ~$500K
 * **Type:** AMM (V2 + V3)
 * **Docs:** https://docs.pancakeswap.finance
 *
 * Available functions:
 * - {@link getPancakeSwapPools} — all PancakeSwap V3 pools on Monad
 * - {@link getPancakeSwapPrice} — best price via QuoterV2 across all fee tiers
 * - {@link getPancakeSwapQuote} — exact-input quote with fee tier selection
 * - {@link getPancakeSwapTopPairs} — most active trading pairs with liquidity data
 */

// Rampart SDK — PancakeSwap V3 on Monad Mainnet (Phase 3.1)
// Uniswap V3 fork — same ABI, different addresses.
// Verified from monad-crypto/protocols/mainnet/pancakeswap.jsonc
// Note: pools deployed, liquidity will grow over time.

import { publicClient } from '../chain'
import { getToken } from './dex/tokens'
import type { Pool } from '../types'

const PANCAKE_V3_FACTORY:    `0x${string}` = '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865'
const PANCAKE_V3_QUOTER_V2:  `0x${string}` = '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997'
const PANCAKE_SMART_ROUTER:  `0x${string}` = '0x21114915Ac6d5A2e156931e20B20b038dEd0Be7C'
const PANCAKE_POSITION_MGR:  `0x${string}` = '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364'

// Standard V3 fee tiers used by PancakeSwap V3
const FEE_TIERS = [100, 500, 2500, 3000, 10000] as const

// ─── ABIs ────────────────────────────────────────────────────────────────────

const FACTORY_ABI = [
  {
    name: 'getPool',
    type: 'function' as const,
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'fee',    type: 'uint24'  },
    ],
    outputs: [{ name: 'pool', type: 'address' }],
    stateMutability: 'view' as const,
  },
] as const

const QUOTER_V2_ABI = [
  {
    name: 'quoteExactInputSingle',
    type: 'function' as const,
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
      { name: 'amountOut',               type: 'uint256' },
      { name: 'sqrtPriceX96After',        type: 'uint160' },
      { name: 'initializedTicksCrossed',  type: 'uint32'  },
      { name: 'gasEstimate',              type: 'uint256' },
    ],
    stateMutability: 'nonpayable' as const,
  },
] as const

const POOL_ABI = [
  {
    name: 'slot0',
    type: 'function' as const,
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
    stateMutability: 'view' as const,
  },
  {
    name: 'liquidity',
    type: 'function' as const,
    inputs: [],
    outputs: [{ type: 'uint128' }],
    stateMutability: 'view' as const,
  },
] as const

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PancakeSwapPair {
  address:    string
  token0:     string
  token1:     string
  fee:        number
  liquidity:  bigint
  sqrtPrice:  bigint
}

export interface PancakeSwapQuote {
  tokenIn:    string
  tokenOut:   string
  fee:        number
  amountIn:   bigint
  amountOut:  bigint
  price:      number     // amountOut per unit of amountIn (human-readable)
  gasEstimate: bigint
}

// ─── Seed pairs (popular token pairs to probe on-chain) ──────────────────────

const SEED_PAIRS: Array<[string, string]> = [
  ['WMON', 'USDC'],
  ['WMON', 'USDT'],
  ['WMON', 'WETH'],
  ['WMON', 'WBTC'],
  ['USDC', 'USDT'],
  ['WETH', 'USDC'],
  ['WBTC', 'USDC'],
]

// ─── Functions ───────────────────────────────────────────────────────────────

/**
 * Discovers active PancakeSwap V3 pools by probing the factory for known token pairs.
 *
 * Checks every combination of `SEED_PAIRS` × `FEE_TIERS` against `factory.getPool()`.
 * Only pairs with a deployed (non-zero) pool address are included in the result.
 *
 * @returns Array of {@link Pool} objects for every found pool
 *
 * @example
 * ```typescript
 * const pools = await getPancakeSwapPools()
 * // → [{ protocol: 'pancakeswap-v3', address: '0x...', token0: 'WMON', token1: 'USDC', fee: 0.0005 }]
 * ```
 *
 * @category DEX
 */
export async function getPancakeSwapPools(): Promise<Pool[]> {
  const pools: Pool[] = []

  await Promise.allSettled(
    SEED_PAIRS.flatMap(([symA, symB]) =>
      FEE_TIERS.map(async fee => {
        try {
          const tA = getToken(symA)
          const tB = getToken(symB)
          const addr = await publicClient.readContract({
            address: PANCAKE_V3_FACTORY,
            abi:     FACTORY_ABI,
            functionName: 'getPool',
            args: [tA.address, tB.address, fee],
          })
          if (!addr || addr === '0x0000000000000000000000000000000000000000') return
          pools.push({
            protocol: 'pancakeswap-v3' as any,
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
 * Returns the best price for a token pair across all PancakeSwap V3 fee tiers.
 *
 * Uses QuoterV2 `quoteExactInputSingle` via `simulateContract` (required because QuoterV2
 * is non-view). Tries all five fee tiers in parallel and returns the highest `amountOut`
 * expressed in human-readable units of `tokenOut`.
 *
 * @param tokenIn  - Symbol of the input token (e.g. `'WMON'`)
 * @param tokenOut - Symbol of the output token (e.g. `'USDC'`)
 * @param amountIn - Raw amount of `tokenIn` to quote (defaults to 1 full token)
 * @returns Best output amount in human-readable units, or `0` if no pool exists
 *
 * @example
 * ```typescript
 * const price = await getPancakeSwapPrice('WMON', 'USDC')
 * // → 0.354
 * ```
 *
 * @category DEX
 */
export async function getPancakeSwapPrice(
  tokenIn:  string,
  tokenOut: string,
  amountIn?: bigint,
): Promise<number> {
  const tIn  = getToken(tokenIn)
  const tOut = getToken(tokenOut)
  const amt  = amountIn ?? BigInt(10 ** tIn.decimals)  // default: 1 token

  const results = await Promise.allSettled(
    FEE_TIERS.map(fee =>
      publicClient.simulateContract({
        address:      PANCAKE_V3_QUOTER_V2,
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
}

/**
 * Returns a full exact-input quote for a swap, selecting the best fee tier.
 *
 * Simulates `quoteExactInputSingle` across all five fee tiers in parallel via QuoterV2
 * and returns the quote with the highest `amountOut`, including fee tier, price ratio,
 * and gas estimate. Returns `null` if no pool exists for the pair.
 *
 * @param tokenIn  - Symbol of the input token (e.g. `'WMON'`)
 * @param tokenOut - Symbol of the output token (e.g. `'USDC'`)
 * @param amountIn - Exact raw amount of `tokenIn` to swap (bigint)
 * @returns A {@link PancakeSwapQuote} with the best fee tier and amounts, or `null` if no pool
 *
 * @example
 * ```typescript
 * const quote = await getPancakeSwapQuote('WMON', 'USDC', 1_000_000_000_000_000_000n)
 * // → { tokenIn: 'WMON', tokenOut: 'USDC', fee: 500, amountOut: 354000n, price: 0.354, ... }
 * ```
 *
 * @category DEX
 */
export async function getPancakeSwapQuote(
  tokenIn:  string,
  tokenOut: string,
  amountIn: bigint,
): Promise<PancakeSwapQuote | null> {
  const tIn  = getToken(tokenIn)
  const tOut = getToken(tokenOut)

  let best: PancakeSwapQuote | null = null

  const results = await Promise.allSettled(
    FEE_TIERS.map(fee =>
      publicClient.simulateContract({
        address:      PANCAKE_V3_QUOTER_V2,
        abi:          QUOTER_V2_ABI,
        functionName: 'quoteExactInputSingle',
        args: [{ tokenIn: tIn.address, tokenOut: tOut.address, amountIn, fee, sqrtPriceLimitX96: 0n }],
      })
    )
  )

  for (let i = 0; i < FEE_TIERS.length; i++) {
    const r = results[i]
    if (r.status !== 'fulfilled') continue
    const [amountOut, , , gasEstimate] = r.value.result as [bigint, bigint, number, bigint]
    if (!best || amountOut > best.amountOut) {
      best = {
        tokenIn,
        tokenOut,
        fee:        FEE_TIERS[i],
        amountIn,
        amountOut,
        price:      Number(amountOut) / 10 ** tOut.decimals / (Number(amountIn) / 10 ** tIn.decimals),
        gasEstimate,
      }
    }
  }

  return best
}

/**
 * Returns the most active trading pairs on PancakeSwap V3 with on-chain liquidity data.
 *
 * For each seed pair, finds the lowest fee tier with a deployed pool, then fetches
 * `slot0` (sqrtPriceX96) and `liquidity` to populate the result. One entry per pair
 * (best fee tier only).
 *
 * @returns Array of {@link PancakeSwapPair} objects with address, fee, liquidity, and sqrtPrice
 *
 * @example
 * ```typescript
 * const pairs = await getPancakeSwapTopPairs()
 * // → [{ address: '0x...', token0: 'WMON', token1: 'USDC', fee: 500, liquidity: 123456n, ... }]
 * ```
 *
 * @category DEX
 */
export async function getPancakeSwapTopPairs(): Promise<PancakeSwapPair[]> {
  const pairs: PancakeSwapPair[] = []

  await Promise.allSettled(
    SEED_PAIRS.map(async ([symA, symB]) => {
      const tA = getToken(symA)
      const tB = getToken(symB)

      // Find the lowest fee tier with an existing pool
      for (const fee of FEE_TIERS) {
        try {
          const poolAddr = await publicClient.readContract({
            address: PANCAKE_V3_FACTORY,
            abi:     FACTORY_ABI,
            functionName: 'getPool',
            args: [tA.address, tB.address, fee],
          })
          if (!poolAddr || poolAddr === '0x0000000000000000000000000000000000000000') continue

          const [slot0Data, liq] = await Promise.all([
            publicClient.readContract({ address: poolAddr, abi: POOL_ABI, functionName: 'slot0' }),
            publicClient.readContract({ address: poolAddr, abi: POOL_ABI, functionName: 'liquidity' }),
          ])
          const [sqrtPrice] = slot0Data as [bigint, number, number, number, number, number, boolean]

          pairs.push({
            address:   poolAddr,
            token0:    symA,
            token1:    symB,
            fee,
            liquidity: liq as bigint,
            sqrtPrice: sqrtPrice,
          })
          break  // only need the best fee tier per pair
        } catch {
          continue
        }
      }
    })
  )

  return pairs
}

/** Contract addresses for external reference. */
export const PANCAKE_ADDRESSES = {
  factory:    PANCAKE_V3_FACTORY,
  quoterV2:   PANCAKE_V3_QUOTER_V2,
  smartRouter: PANCAKE_SMART_ROUTER,
  positionMgr: PANCAKE_POSITION_MGR,
} as const
