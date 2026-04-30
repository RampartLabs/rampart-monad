/**
 * @module LFJ
 * @description LFJ (formerly Trader Joe) Liquidity Book AMM on Monad Mainnet.
 * Uses discrete price bins rather than a continuous curve — the active bin
 * determines the current market price and concentrates liquidity with zero
 * slippage within a single bin.
 *
 * **TVL:** ~$1M
 * **Type:** Liquidity Book AMM (Trader Joe V2)
 * **Docs:** https://docs.traderjoexyz.com
 *
 * Available functions:
 * - {@link getLFJPools} — all LFJ Liquidity Book pairs with bin step and liquidity
 * - {@link getLFJPriceByAddress} — price from pair address via LBQuoter
 * - {@link getLFJPrice} — best price across all LFJ pairs for a token pair
 * - {@link getLFJPairCount} — total number of LFJ pairs deployed
 * - {@link getLFJPairsForTokens} — all pairs for a specific token combination
 */

// ============================================================
// Rampart SDK — LFJ (formerly Trader Joe) Liquidity Book on Monad (Phase 3.2)
// Liquidity Book model: discrete bins instead of continuous AMM.
// Each bin has a fixed price; active bin determines current market price.
// Verified from monad-crypto/protocols/mainnet/lfj.jsonc
// ============================================================

import { publicClient } from '../chain'

const LB_FACTORY:    `0x${string}` = '0xb43120c4745967fa9b93E79C149E66B0f2D6Fe0c'
const LB_ROUTER:     `0x${string}` = '0x18556DA13313f3532c54711497A8FedAC273220E'
const LB_QUOTER:     `0x${string}` = '0x9A550a522BBaDFB69019b0432800Ed17855A51C3'
const LB_HOOKS_LENS: `0x${string}` = '0x6124086B90AB910038E607aa1BDD67b284C31c98'

// ─── ABIs ────────────────────────────────────────────────────────────────────

const LB_FACTORY_ABI = [
  {
    name: 'getNumberOfLBPairs',
    type: 'function' as const,
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'getLBPairAtIndex',
    type: 'function' as const,
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ name: 'pair', type: 'address' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'getAllLBPairs',
    type: 'function' as const,
    inputs: [
      { name: 'tokenX', type: 'address' },
      { name: 'tokenY', type: 'address' },
    ],
    outputs: [{
      type: 'tuple[]',
      components: [
        { name: 'binStep',          type: 'uint16'  },
        { name: 'LBPair',           type: 'address' },
        { name: 'createdByOwner',   type: 'bool'    },
        { name: 'ignoredForRouting',type: 'bool'    },
      ],
    }],
    stateMutability: 'view' as const,
  },
] as const

const LB_PAIR_ABI = [
  {
    name: 'getTokenX',
    type: 'function' as const,
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'getTokenY',
    type: 'function' as const,
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'getBinStep',
    type: 'function' as const,
    inputs: [],
    outputs: [{ type: 'uint16' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'getActiveId',
    type: 'function' as const,
    inputs: [],
    outputs: [{ type: 'uint24' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'getPriceFromId',
    type: 'function' as const,
    inputs: [{ name: 'id', type: 'uint24' }],
    outputs: [{ name: 'price', type: 'uint256' }],
    stateMutability: 'pure' as const,
  },
  {
    name: 'getReserves',
    type: 'function' as const,
    inputs: [],
    outputs: [
      { name: 'reserveX', type: 'uint128' },
      { name: 'reserveY', type: 'uint128' },
    ],
    stateMutability: 'view' as const,
  },
  {
    name: 'getStaticFeeParameters',
    type: 'function' as const,
    inputs: [],
    outputs: [
      { name: 'baseFactor',          type: 'uint16' },
      { name: 'filterPeriod',        type: 'uint16' },
      { name: 'decayPeriod',         type: 'uint16' },
      { name: 'reductionFactor',     type: 'uint16' },
      { name: 'variableFeeControl',  type: 'uint24' },
      { name: 'protocolShare',       type: 'uint16' },
      { name: 'maxVolatilityAccumulator', type: 'uint24' },
    ],
    stateMutability: 'view' as const,
  },
] as const

const LB_QUOTER_ABI = [
  {
    name: 'findBestPathFromAmountIn',
    type: 'function' as const,
    inputs: [
      { name: 'route',    type: 'address[]' },
      { name: 'amountIn', type: 'uint128'   },
    ],
    outputs: [{
      name: 'quote',
      type: 'tuple',
      components: [
        { name: 'route',                         type: 'address[]' },
        { name: 'pairs',                         type: 'address[]' },
        { name: 'binSteps',                      type: 'uint256[]' },
        { name: 'versions',                      type: 'uint8[]'   },
        { name: 'amounts',                       type: 'uint128[]' },
        { name: 'virtualAmountsWithoutSlippage', type: 'uint128[]' },
        { name: 'fees',                          type: 'uint128[]' },
      ],
    }],
    stateMutability: 'view' as const,
  },
] as const

const ERC20_ABI = [
  {
    name: 'symbol',
    type: 'function' as const,
    inputs: [],
    outputs: [{ type: 'string' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'decimals',
    type: 'function' as const,
    inputs: [],
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view' as const,
  },
] as const

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LFJPool {
  address:      string
  tokenX:       string       // symbol of tokenX
  tokenY:       string       // symbol of tokenY
  tokenXAddr:   string
  tokenYAddr:   string
  binStep:      number       // bin step in bps (e.g. 25 = 0.25% price step per bin)
  activeId:     number       // current active bin ID
  price:        number       // tokenX price in tokenY units (from active bin)
  reserveX:     bigint
  reserveY:     bigint
  hasLiquidity: boolean
  baseFee:      number       // base fee in bps (e.g. 15 = 0.15%)
  protocolShare: number      // fraction of fees going to protocol (0..1)
}

export interface LFJQuote {
  route:     string[]
  amountIn:  bigint
  amountOut: bigint
  price:     number       // human-readable price (amountOut per unit of amountIn)
}

// ─── Functions ───────────────────────────────────────────────────────────────

/**
 * Fetch all LFJ Liquidity Book pools from the LBFactory.
 *
 * Iterates pairs by index in batches of 10, fetching tokenX/Y addresses,
 * bin step, active bin ID, reserves, and computing the current price from
 * the active bin's `getPriceFromId` (128.128 fixed-point, decimal-adjusted).
 *
 * @param maxPools - Maximum number of pools to fetch (default: 50)
 * @returns Array of pools sorted by factory index, skipping any that revert
 *
 * @example
 * ```typescript
 * const pools = await getLFJPools(20)
 * // → [{ address: '0x...', tokenX: 'WMON', tokenY: 'USDC', binStep: 25, price: 0.354, ... }]
 * ```
 *
 * @category DEX
 */
export async function getLFJPools(maxPools = 50): Promise<LFJPool[]> {
  let count: bigint
  try {
    count = await publicClient.readContract({
      address:      LB_FACTORY,
      abi:          LB_FACTORY_ABI,
      functionName: 'getNumberOfLBPairs',
    }) as bigint
  } catch {
    return []
  }

  const limit = count < BigInt(maxPools) ? count : BigInt(maxPools)
  const indices = Array.from({ length: Number(limit) }, (_, i) => BigInt(i))

  const pools: LFJPool[] = []
  const batchSize = 10

  for (let i = 0; i < indices.length; i += batchSize) {
    const batch = indices.slice(i, i + batchSize)
    const addrs = await Promise.allSettled(
      batch.map(idx =>
        publicClient.readContract({
          address:      LB_FACTORY,
          abi:          LB_FACTORY_ABI,
          functionName: 'getLBPairAtIndex',
          args:         [idx],
        })
      )
    )

    await Promise.allSettled(
      addrs.map(async (res, j) => {
        if (res.status !== 'fulfilled') return
        const pairAddr = res.value as `0x${string}`
        try {
          const [tokenX, tokenY, binStep, activeId, reserves, feeParams] = await Promise.all([
            publicClient.readContract({ address: pairAddr, abi: LB_PAIR_ABI, functionName: 'getTokenX' }),
            publicClient.readContract({ address: pairAddr, abi: LB_PAIR_ABI, functionName: 'getTokenY' }),
            publicClient.readContract({ address: pairAddr, abi: LB_PAIR_ABI, functionName: 'getBinStep' }),
            publicClient.readContract({ address: pairAddr, abi: LB_PAIR_ABI, functionName: 'getActiveId' }),
            publicClient.readContract({ address: pairAddr, abi: LB_PAIR_ABI, functionName: 'getReserves' }),
            publicClient.readContract({ address: pairAddr, abi: LB_PAIR_ABI, functionName: 'getStaticFeeParameters' }).catch(() => null),
          ])

          const [symX, decX, symY, decY] = await Promise.all([
            publicClient.readContract({ address: tokenX as `0x${string}`, abi: ERC20_ABI, functionName: 'symbol' }),
            publicClient.readContract({ address: tokenX as `0x${string}`, abi: ERC20_ABI, functionName: 'decimals' }),
            publicClient.readContract({ address: tokenY as `0x${string}`, abi: ERC20_ABI, functionName: 'symbol' }),
            publicClient.readContract({ address: tokenY as `0x${string}`, abi: ERC20_ABI, functionName: 'decimals' }),
          ])

          // Calculate price from active bin
          // price = (1 + binStep/10000)^(activeId - 8388608) — scaled by 2^128
          let price = 0
          try {
            const priceRaw = await publicClient.readContract({
              address: pairAddr, abi: LB_PAIR_ABI, functionName: 'getPriceFromId',
              args: [Number(activeId)],
            }) as bigint
            // Convert from 128.128 fixed-point to decimal, adjust for decimals
            const priceFixed = Number(priceRaw) / 2 ** 128
            const decAdjust  = 10 ** (Number(decY) - Number(decX))
            price = priceFixed * decAdjust
          } catch { /* price stays 0 */ }

          const [reserveX, reserveY] = reserves as unknown as [bigint, bigint]
          const fp = feeParams as any
          const baseFee      = fp ? Number(fp.baseFactor) * Number(binStep) / 1e6 : 0  // in bps -> fraction
          const protocolShare = fp ? Number(fp.protocolShare) / 10000 : 0

          pools.push({
            address:      pairAddr,
            tokenX:       symX as string,
            tokenY:       symY as string,
            tokenXAddr:   tokenX as string,
            tokenYAddr:   tokenY as string,
            binStep:      Number(binStep),
            activeId:     Number(activeId),
            price,
            reserveX,
            reserveY,
            hasLiquidity: reserveX > 0n || reserveY > 0n,
            baseFee,
            protocolShare,
          })
        } catch { /* skip this pool */ }
      })
    )
  }

  return pools
}

/**
 * Get a swap quote from a known pair address using LFJ's LBQuoter.
 *
 * Calls `findBestPathFromAmountIn` with a direct two-token route. The quoter
 * returns the optimal bin sequence and output amount. Decimal adjustment is
 * left to the caller since token metadata is not fetched here.
 *
 * @param tokenInAddr  - Address of the input token
 * @param tokenOutAddr - Address of the output token
 * @param amountIn     - Input amount in raw units (uint128)
 * @returns Quote with route, raw amountOut, and zero-adjusted price, or `null` if no route
 *
 * @example
 * ```typescript
 * const quote = await getLFJPriceByAddress(WMON, USDC, 1n * 10n ** 18n)
 * // → { route: ['0x...', '0x...'], amountIn: 1000000000000000000n, amountOut: 354000n, price: 0 }
 * ```
 *
 * @category DEX
 */
export async function getLFJPriceByAddress(
  tokenInAddr:  string,
  tokenOutAddr: string,
  amountIn:     bigint,
): Promise<LFJQuote | null> {
  try {
    const quote = await publicClient.readContract({
      address:      LB_QUOTER,
      abi:          LB_QUOTER_ABI,
      functionName: 'findBestPathFromAmountIn',
      args: [[tokenInAddr as `0x${string}`, tokenOutAddr as `0x${string}`], amountIn as bigint],
    }) as unknown as {
      route: string[]
      pairs: string[]
      amounts: bigint[]
    }

    const amounts   = quote.amounts ?? []
    const amountOut = amounts[amounts.length - 1] ?? 0n

    if (!amountOut || amountOut <= 0n) return null

    return {
      route:     quote.route,
      amountIn,
      amountOut,
      price:     0, // caller should apply decimal adjustment
    }
  } catch {
    return null
  }
}

/**
 * Get the human-readable price of tokenX denominated in tokenY via LFJ.
 *
 * Sends exactly 1 unit of tokenX (adjusted for decimals) through the LBQuoter
 * and converts the raw output to a decimal number using tokenY decimals.
 *
 * @param tokenXAddr     - Address of the input token
 * @param tokenYAddr     - Address of the output (quote) token
 * @param tokenXDecimals - Decimals of the input token (default: 18)
 * @param tokenYDecimals - Decimals of the output token (default: 6)
 * @returns Price as a float (tokenY units per 1 tokenX), or 0 if no route
 *
 * @example
 * ```typescript
 * const price = await getLFJPrice(WMON, USDC)
 * // → 0.354
 * ```
 *
 * @category DEX
 */
export async function getLFJPrice(
  tokenXAddr:      string,
  tokenYAddr:      string,
  tokenXDecimals = 18,
  tokenYDecimals = 6,
): Promise<number> {
  const amountIn = BigInt(10 ** tokenXDecimals)  // 1 token
  const quote = await getLFJPriceByAddress(tokenXAddr, tokenYAddr, amountIn)
  if (!quote) return 0
  return Number(quote.amountOut) / 10 ** tokenYDecimals
}

/**
 * Return the total number of LFJ Liquidity Book pairs deployed on Monad.
 *
 * @returns Total pair count from the LBFactory, or 0 on error
 *
 * @example
 * ```typescript
 * const count = await getLFJPairCount()
 * // → 42
 * ```
 *
 * @category DEX
 */
export async function getLFJPairCount(): Promise<number> {
  try {
    const count = await publicClient.readContract({
      address:      LB_FACTORY,
      abi:          LB_FACTORY_ABI,
      functionName: 'getNumberOfLBPairs',
    })
    return Number(count)
  } catch {
    return 0
  }
}

/**
 * Get all LFJ pairs for a specific token combination across all bin steps.
 *
 * Uses `LBFactory.getAllLBPairs` to enumerate every deployed pair for the
 * given tokens regardless of bin step. Useful for finding the pair with the
 * tightest spread or highest liquidity.
 *
 * @param tokenX - Address of tokenX
 * @param tokenY - Address of tokenY
 * @returns Array of pair descriptors with bin step, address, and routing flag
 *
 * @example
 * ```typescript
 * const pairs = await getLFJPairsForTokens(WMON, USDC)
 * // → [{ binStep: 25, address: '0x...', ignoredForRouting: false }]
 * ```
 *
 * @category DEX
 */
export async function getLFJPairsForTokens(
  tokenX: string,
  tokenY: string,
): Promise<Array<{ binStep: number; address: string; ignoredForRouting: boolean }>> {
  try {
    const pairs = await publicClient.readContract({
      address:      LB_FACTORY,
      abi:          LB_FACTORY_ABI,
      functionName: 'getAllLBPairs',
      args:         [tokenX as `0x${string}`, tokenY as `0x${string}`],
    }) as unknown as Array<{ binStep: number; LBPair: string; ignoredForRouting: boolean }>

    return pairs.map(p => ({
      binStep:          Number(p.binStep),
      address:          p.LBPair,
      ignoredForRouting: p.ignoredForRouting,
    }))
  } catch {
    return []
  }
}

/**
 * Deployed LFJ contract addresses on Monad Mainnet.
 *
 * @category DEX
 */
export const LFJ_ADDRESSES = {
  factory:   LB_FACTORY,
  router:    LB_ROUTER,
  quoter:    LB_QUOTER,
  hooksLens: LB_HOOKS_LENS,
} as const
