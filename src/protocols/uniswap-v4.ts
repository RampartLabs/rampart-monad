/**
 * @module UniswapV4
 * @description Uniswap V4 pools on Monad Mainnet. V4 introduces a single
 * PoolManager singleton, a hook system for custom logic, and the Currency
 * type where `address(0)` represents native MON. Pool IDs are `bytes32`
 * hashes of the PoolKey struct.
 *
 * **TVL:** ~$100K
 * **Type:** AMM (Uniswap V4 hooks)
 * **Docs:** https://docs.uniswap.org/contracts/v4
 *
 * Available functions:
 * - {@link computeV4PoolId} — compute deterministic pool ID from PoolKey
 * - {@link getUniswapV4Pools} — discover V4 pools via Initialize events
 * - {@link getUniswapV4PoolState} — on-chain pool state (sqrtPriceX96, tick, liquidity)
 * - {@link getUniswapV4Price} — price from sqrtPriceX96 across all fee tiers
 * - {@link simulateUniswapV4Swap} — swap output estimate via V4Quoter
 */

// ============================================================
// Rampart SDK — Uniswap V4 on Monad Mainnet (Phase 3.4)
// V4 architecture: single PoolManager singleton, hook system,
// Currency type (address(0) = native MON), PoolId = bytes32.
// Verified from monad-crypto/protocols + on-chain deployment.
// ============================================================

import { publicClient } from '../chain'
import { keccak256, encodeAbiParameters, parseAbiParameters, zeroAddress } from 'viem'

const POOL_MANAGER:     `0x${string}` = '0x188d586ddcf52439676ca21a244753fa19f9ea8e'
const POSITION_MANAGER: `0x${string}` = '0x5b7ec4a94ff9bedb700fb82ab09d5846972f4016'
const V4_QUOTER:        `0x${string}` = '0xa222dd357a9076d1091ed6aa2e16c9742dd26891'

// address(0) represents native MON in V4 Currency type
const NATIVE_MON = zeroAddress

// Standard fee tiers × tick spacings for pool probing
const V4_CONFIGS: Array<{ fee: number; tickSpacing: number }> = [
  { fee: 100,   tickSpacing: 1  },
  { fee: 500,   tickSpacing: 10 },
  { fee: 3000,  tickSpacing: 60 },
  { fee: 10000, tickSpacing: 200 },
]

// ─── ABIs ────────────────────────────────────────────────────────────────────

const POOL_MANAGER_ABI = [
  {
    name: 'getSlot0',
    type: 'function' as const,
    inputs: [{ name: 'id', type: 'bytes32' }],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick',         type: 'int24'   },
      { name: 'protocolFee', type: 'uint24'   },
      { name: 'lpFee',       type: 'uint24'   },
    ],
    stateMutability: 'view' as const,
  },
  {
    name: 'getLiquidity',
    type: 'function' as const,
    inputs: [{ name: 'id', type: 'bytes32' }],
    outputs: [{ name: 'liquidity', type: 'uint128' }],
    stateMutability: 'view' as const,
  },
] as const

const V4_QUOTER_ABI = [
  {
    name: 'quoteExactInputSingle',
    type: 'function' as const,
    inputs: [{
      name: 'params',
      type: 'tuple',
      components: [
        {
          name: 'poolKey',
          type: 'tuple',
          components: [
            { name: 'currency0',  type: 'address' },
            { name: 'currency1',  type: 'address' },
            { name: 'fee',        type: 'uint24'  },
            { name: 'tickSpacing',type: 'int24'   },
            { name: 'hooks',      type: 'address' },
          ],
        },
        { name: 'zeroForOne', type: 'bool'    },
        { name: 'exactAmount',type: 'uint128' },
        { name: 'hookData',   type: 'bytes'   },
      ],
    }],
    outputs: [
      { name: 'amountOut',   type: 'uint256' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
    stateMutability: 'nonpayable' as const,
  },
] as const

// ─── Types ───────────────────────────────────────────────────────────────────

export interface V4PoolKey {
  currency0:   string   // lower address (address(0) for native MON)
  currency1:   string   // higher address
  fee:         number   // LP fee in pips (e.g. 3000 = 0.3%)
  tickSpacing: number
  hooks:       string   // hook contract address (address(0) = no hook)
}

export interface UniswapV4Pool {
  id:          string   // bytes32 pool ID
  poolKey:     V4PoolKey
  sqrtPriceX96: bigint
  tick:        number
  liquidity:   bigint
  hasLiquidity: boolean
  token0Symbol: string
  token1Symbol: string
}

export interface V4SwapSimulation {
  tokenIn:     string
  tokenOut:    string
  amountIn:    bigint
  amountOut:   bigint
  price:       number   // tokenOut per tokenIn (human-readable)
  gasEstimate: bigint
  poolKey:     V4PoolKey
}

// ─── Pool ID helpers ──────────────────────────────────────────────────────────

/**
 * Compute the deterministic Uniswap V4 pool ID (`bytes32`) from a PoolKey.
 *
 * The V4 PoolId is defined as `keccak256(abi.encode(PoolKey))`. Sorting
 * currencies so that `currency0 < currency1` is required before calling.
 *
 * @param poolKey - The V4 pool key struct (currency0, currency1, fee, tickSpacing, hooks)
 * @returns 32-byte pool ID as a hex string
 *
 * @example
 * ```typescript
 * const id = computeV4PoolId({ currency0: zeroAddress, currency1: USDC, fee: 3000, tickSpacing: 60, hooks: zeroAddress })
 * // → '0xabc123...'
 * ```
 *
 * @category DEX
 */
export function computeV4PoolId(poolKey: V4PoolKey): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters('address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks'),
      [
        poolKey.currency0 as `0x${string}`,
        poolKey.currency1 as `0x${string}`,
        poolKey.fee,
        poolKey.tickSpacing,
        poolKey.hooks as `0x${string}`,
      ]
    )
  )
}

/**
 * Sort two currency addresses for V4 pool key (currency0 < currency1).
 * address(0) (native) is always currency0.
 */
function sortCurrencies(a: string, b: string): [string, string] {
  if (a === zeroAddress) return [a, b]
  if (b === zeroAddress) return [b, a]
  return BigInt(a) < BigInt(b) ? [a, b] : [b, a]
}

// ─── Functions ───────────────────────────────────────────────────────────────

/**
 * Discover Uniswap V4 pools by scanning `Initialize` events in a recent block window.
 *
 * For each event found, the function also fetches current liquidity from the
 * PoolManager. Monad's public RPC limits `getLogs` to ~100-block ranges so
 * the default window is kept small.
 *
 * @param lookbackBlocks - Number of recent blocks to scan for Initialize events (default: 100)
 * @returns Array of discovered V4 pools with state and liquidity data
 *
 * @example
 * ```typescript
 * const pools = await getUniswapV4Pools(200)
 * // → [{ id: '0x...', poolKey: { ... }, sqrtPriceX96: 123n, hasLiquidity: true, ... }]
 * ```
 *
 * @category DEX
 */
export async function getUniswapV4Pools(lookbackBlocks = 100): Promise<UniswapV4Pool[]> {
  const pools: UniswapV4Pool[] = []

  try {
    const currentBlock = await publicClient.getBlockNumber()
    const fromBlock    = currentBlock > BigInt(lookbackBlocks)
      ? currentBlock - BigInt(lookbackBlocks)
      : 1n

    const logs = await publicClient.getLogs({
      address: POOL_MANAGER,
      event: {
        name: 'Initialize',
        type: 'event',
        inputs: [
          { name: 'id',          type: 'bytes32',  indexed: true  },
          { name: 'currency0',   type: 'address',  indexed: true  },
          { name: 'currency1',   type: 'address',  indexed: true  },
          { name: 'fee',         type: 'uint24',   indexed: false },
          { name: 'tickSpacing', type: 'int24',    indexed: false },
          { name: 'hooks',       type: 'address',  indexed: false },
          { name: 'sqrtPriceX96', type: 'uint160', indexed: false },
          { name: 'tick',        type: 'int24',    indexed: false },
        ],
      },
      fromBlock,
      toBlock: currentBlock,
    })

    await Promise.allSettled(
      logs.map(async log => {
        const args = log.args as {
          id: `0x${string}`; currency0: `0x${string}`; currency1: `0x${string}`
          fee: number; tickSpacing: number; hooks: `0x${string}`
          sqrtPriceX96: bigint; tick: number
        }
        if (!args?.id) return

        let liq = 0n
        try {
          liq = await publicClient.readContract({
            address: POOL_MANAGER, abi: POOL_MANAGER_ABI,
            functionName: 'getLiquidity', args: [args.id],
          }) as bigint
        } catch { /* liquidity not available */ }

        pools.push({
          id:          args.id,
          poolKey:     { currency0: args.currency0, currency1: args.currency1, fee: args.fee, tickSpacing: args.tickSpacing, hooks: args.hooks },
          sqrtPriceX96: args.sqrtPriceX96,
          tick:         args.tick,
          liquidity:    liq,
          hasLiquidity: liq > 0n,
          token0Symbol: args.currency0 === zeroAddress ? 'MON' : args.currency0.slice(0, 8),
          token1Symbol: args.currency1.slice(0, 8),
        })
      })
    )
  } catch {
    // getLogs failed — return empty (pools can be queried directly via getUniswapV4Price)
  }

  return pools
}

/**
 * Fetch the on-chain state of a Uniswap V4 pool from PoolManager's `slot0`.
 *
 * Reads `sqrtPriceX96`, current tick, and total liquidity in one round-trip.
 * Returns `null` when the pool has not been initialized (sqrtPriceX96 == 0).
 *
 * @param poolKey - The V4 pool key identifying the pool
 * @returns Pool state including sqrtPriceX96, tick, liquidity, and human price, or `null` if pool does not exist
 *
 * @example
 * ```typescript
 * const state = await getUniswapV4PoolState(poolKey)
 * // → { sqrtPriceX96: 79228162514264337593543950336n, tick: 0, liquidity: 5000000n, price: 1.0 }
 * ```
 *
 * @category DEX
 */
export async function getUniswapV4PoolState(poolKey: V4PoolKey): Promise<{
  sqrtPriceX96: bigint
  tick:         number
  liquidity:    bigint
  price:        number    // token1 per token0 (approximation)
} | null> {
  try {
    const poolId = computeV4PoolId(poolKey)
    const [slot0, liq] = await Promise.all([
      publicClient.readContract({
        address: POOL_MANAGER, abi: POOL_MANAGER_ABI,
        functionName: 'getSlot0', args: [poolId],
      }),
      publicClient.readContract({
        address: POOL_MANAGER, abi: POOL_MANAGER_ABI,
        functionName: 'getLiquidity', args: [poolId],
      }),
    ])
    const [sqrtPriceX96, tick] = slot0 as [bigint, number, number, number]
    if (sqrtPriceX96 === 0n) return null

    // price = (sqrtPriceX96 / 2^96)^2
    const price = (Number(sqrtPriceX96) / 2 ** 96) ** 2

    return { sqrtPriceX96, tick: Number(tick), liquidity: liq as bigint, price }
  } catch {
    return null
  }
}

/**
 * Get the best output price for a token swap across all standard V4 fee tiers.
 *
 * Probes fee tiers 100 (0.01%), 500 (0.05%), 3000 (0.3%), and 10000 (1%) in
 * parallel via `V4Quoter.quoteExactInputSingle` and returns the highest
 * `amountOut` converted to a human-readable number. Pass `address(0)` for
 * native MON.
 *
 * @param currency0    - Address of currency0 (use `address(0)` for native MON)
 * @param currency1    - Address of currency1
 * @param amountIn     - Exact input amount in raw units (bigint)
 * @param currency0Dec - Decimals of currency0 (default: 18)
 * @param currency1Dec - Decimals of currency1 (default: 6)
 * @returns Best output amount as a human-readable number, or 0 if no pool found
 *
 * @example
 * ```typescript
 * const price = await getUniswapV4Price(zeroAddress, USDC, 1n * 10n ** 18n)
 * // → 0.354  (0.354 USDC per MON)
 * ```
 *
 * @category DEX
 */
export async function getUniswapV4Price(
  currency0:    string,
  currency1:    string,
  amountIn:     bigint,
  currency0Dec = 18,
  currency1Dec = 6,
): Promise<number> {
  const [c0, c1] = sortCurrencies(currency0, currency1)
  const zeroForOne = c0 === currency0

  const results = await Promise.allSettled(
    V4_CONFIGS.map(({ fee, tickSpacing }) =>
      publicClient.simulateContract({
        address:      V4_QUOTER,
        abi:          V4_QUOTER_ABI,
        functionName: 'quoteExactInputSingle',
        args: [{
          poolKey:    { currency0: c0 as `0x${string}`, currency1: c1 as `0x${string}`, fee, tickSpacing, hooks: zeroAddress },
          zeroForOne,
          exactAmount: amountIn as bigint,
          hookData:   '0x',
        }],
      })
    )
  )

  let bestOut = 0n
  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    const [amountOut] = r.value.result as [bigint, bigint]
    if (amountOut > bestOut) bestOut = amountOut
  }

  if (bestOut === 0n) return 0
  const outDecimals = zeroForOne ? currency1Dec : currency0Dec
  return Number(bestOut) / 10 ** outDecimals
}

/**
 * Simulate a Uniswap V4 swap via V4Quoter — read-only, no gas consumed.
 *
 * Probes all standard fee tiers in parallel and returns the full simulation
 * result for the tier that yields the highest `amountOut`, including the
 * winning PoolKey and a gas estimate.
 *
 * @param tokenIn     - Address of input token (`address(0)` for native MON)
 * @param tokenOut    - Address of output token
 * @param amountIn    - Exact input amount in raw units (bigint)
 * @param tokenInDec  - Decimals of input token (default: 18)
 * @param tokenOutDec - Decimals of output token (default: 6)
 * @returns Full swap simulation result with best fee tier, or `null` if no pool found
 *
 * @example
 * ```typescript
 * const sim = await simulateUniswapV4Swap(zeroAddress, USDC, 1n * 10n ** 18n)
 * // → { amountOut: 354000n, price: 0.354, gasEstimate: 80000n, poolKey: { fee: 3000, ... } }
 * ```
 *
 * @category DEX
 */
export async function simulateUniswapV4Swap(
  tokenIn:     string,
  tokenOut:    string,
  amountIn:    bigint,
  tokenInDec = 18,
  tokenOutDec = 6,
): Promise<V4SwapSimulation | null> {
  const [c0, c1] = sortCurrencies(tokenIn, tokenOut)
  const zeroForOne = c0 === tokenIn

  let best: V4SwapSimulation | null = null

  const results = await Promise.allSettled(
    V4_CONFIGS.map(({ fee, tickSpacing }) =>
      publicClient.simulateContract({
        address:      V4_QUOTER,
        abi:          V4_QUOTER_ABI,
        functionName: 'quoteExactInputSingle',
        args: [{
          poolKey:     { currency0: c0 as `0x${string}`, currency1: c1 as `0x${string}`, fee, tickSpacing, hooks: zeroAddress },
          zeroForOne,
          exactAmount: amountIn as bigint,
          hookData:    '0x',
        }],
      })
    )
  )

  for (let i = 0; i < V4_CONFIGS.length; i++) {
    const r = results[i]
    if (r.status !== 'fulfilled') continue
    const [amountOut, gasEstimate] = r.value.result as [bigint, bigint]
    if (!best || amountOut > best.amountOut) {
      const { fee, tickSpacing } = V4_CONFIGS[i]
      best = {
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        price:       Number(amountOut) / 10 ** tokenOutDec / (Number(amountIn) / 10 ** tokenInDec),
        gasEstimate,
        poolKey:     { currency0: c0, currency1: c1, fee, tickSpacing, hooks: zeroAddress },
      }
    }
  }

  return best
}

/**
 * Deployed Uniswap V4 contract addresses on Monad Mainnet.
 *
 * @category DEX
 */
export const UNISWAP_V4_ADDRESSES = {
  poolManager:     POOL_MANAGER,
  positionManager: POSITION_MANAGER,
  quoter:          V4_QUOTER,
} as const
