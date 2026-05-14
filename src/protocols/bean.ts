/**
 * @module Bean
 * @description Bean Exchange — DLMM (Dynamic Liquidity Market Maker) DEX on Monad,
 * modelled after LFJ / Trader Joe v2. Liquidity is packed into discrete price bins;
 * LPs earn fees only in the active bin, similar to concentrated liquidity but with
 * integer bin-step granularity.
 *
 * **TVL:** ~$3M
 * **Type:** DLMM DEX
 * **Docs:** https://docs.beanexchange.io
 *
 * Available functions:
 * - {@link getBeanPairCount} — total number of deployed LB pairs
 * - {@link getBeanPairs} — paginated list of pairs with reserves, TVL, and active price
 * - {@link getBeanPair} — lookup a specific pair by token addresses and optional bin step
 * - {@link getBeanTVL} — total USD locked across all Bean pairs
 */

import { publicClient } from '../chain'
import { getVerifiedPrice } from './oracles'

export const BEAN_ADDRESSES = {
  factory: '0x8Bb9727Ca742C146563DccBAFb9308A234e1d242' as `0x${string}`,
  router:  '0x721aC9E688E6b86F48b08DB2ba2D4B7bBBd12665' as `0x${string}`,
} as const

const FACTORY_ABI = [
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
    outputs: [{ type: 'address' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'getLBPairInformation',
    type: 'function' as const,
    inputs: [
      { name: 'tokenX',  type: 'address' },
      { name: 'tokenY',  type: 'address' },
      { name: 'binStep', type: 'uint256' },
    ],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'binStep',           type: 'uint16'  },
          { name: 'LBPair',            type: 'address' },
          { name: 'createdByOwner',    type: 'bool'    },
          { name: 'ignoredForRouting', type: 'bool'    },
        ],
      },
    ],
    stateMutability: 'view' as const,
  },
  {
    name: 'getAllLBPairs',
    type: 'function' as const,
    inputs: [
      { name: 'tokenX', type: 'address' },
      { name: 'tokenY', type: 'address' },
    ],
    outputs: [
      {
        type: 'tuple[]',
        components: [
          { name: 'binStep',           type: 'uint16'  },
          { name: 'LBPair',            type: 'address' },
          { name: 'createdByOwner',    type: 'bool'    },
          { name: 'ignoredForRouting', type: 'bool'    },
        ],
      },
    ],
    stateMutability: 'view' as const,
  },
] as const

const PAIR_ABI = [
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
    name: 'getActiveId',
    type: 'function' as const,
    inputs: [],
    outputs: [{ name: 'activeId', type: 'uint24' }],
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

const ERC20_ABI = [
  { name: 'symbol',   type: 'function' as const, inputs: [], outputs: [{ type: 'string'  }], stateMutability: 'view' as const },
  { name: 'decimals', type: 'function' as const, inputs: [], outputs: [{ type: 'uint8'   }], stateMutability: 'view' as const },
] as const

export interface BeanPair {
  address:      string
  tokenX:       string
  tokenY:       string
  tokenXSymbol: string
  tokenYSymbol: string
  reserveX:     bigint
  reserveY:     bigint
  activeId:     number
  activePrice:  number
  baseFee:      number
  tvlUSD:       number
  protocol:     string
}

const symbolCache = new Map<string, string>()
const decimalsCache = new Map<string, number>()

async function resolveToken(addr: string): Promise<{ symbol: string; decimals: number }> {
  const key = addr.toLowerCase()
  if (symbolCache.has(key) && decimalsCache.has(key)) {
    return { symbol: symbolCache.get(key)!, decimals: decimalsCache.get(key)! }
  }
  try {
    const [sym, dec] = await Promise.all([
      publicClient.readContract({ address: addr as `0x${string}`, abi: ERC20_ABI, functionName: 'symbol' }).catch(() => 'UNKNOWN'),
      publicClient.readContract({ address: addr as `0x${string}`, abi: ERC20_ABI, functionName: 'decimals' }).catch(() => 18),
    ])
    symbolCache.set(key, sym as string)
    decimalsCache.set(key, Number(dec))
    return { symbol: sym as string, decimals: Number(dec) }
  } catch {
    return { symbol: 'UNKNOWN', decimals: 18 }
  }
}

/**
 * Converts a LFJ/Bean active bin ID to a human-readable price.
 * Formula: 2^(activeId - 8388608) — standard LFJ bin math, result in token units.
 */
function binIdToPrice(activeId: number): number {
  return Math.pow(2, activeId - 8388608)
}

/**
 * Returns the total number of Bean Exchange DLMM pairs deployed on Monad.
 *
 * @returns Total pair count as a number.
 *
 * @category DEX
 */
export async function getBeanPairCount(): Promise<number> {
  const count = await publicClient.readContract({
    address: BEAN_ADDRESSES.factory,
    abi: FACTORY_ABI,
    functionName: 'getNumberOfLBPairs',
  }).catch(() => 0n)

  return Number(count)
}

/**
 * Returns Bean Exchange DLMM pairs with on-chain reserves, TVL, active price, and base fee.
 *
 * @param maxPairs - Maximum number of pairs to fetch (default `20`).
 * @returns Array of {@link BeanPair} objects sorted by factory index.
 *
 * @example
 * ```typescript
 * const pairs = await getBeanPairs(5)
 * // → [{ address: '0x...', tokenXSymbol: 'WMON', tokenYSymbol: 'USDC', tvlUSD: 300000, activePrice: 38.5 }]
 * ```
 *
 * @category DEX
 */
export async function getBeanPairs(maxPairs = 20): Promise<BeanPair[]> {
  const total = await getBeanPairCount()
  const limit = Math.min(total, maxPairs)

  const addresses = await Promise.all(
    Array.from({ length: limit }, (_, i) =>
      publicClient.readContract({
        address: BEAN_ADDRESSES.factory,
        abi: FACTORY_ABI,
        functionName: 'getLBPairAtIndex',
        args: [BigInt(i)],
      }).catch(() => null)
    )
  )

  const pairs = await Promise.all(
    addresses.filter(Boolean).map(async (addr) => {
      const pairAddr = addr as `0x${string}`
      const [tokenXAddr, tokenYAddr, reserves, activeIdRaw, feeParamsRaw] = await Promise.all([
        publicClient.readContract({ address: pairAddr, abi: PAIR_ABI, functionName: 'getTokenX' }).catch(() => null),
        publicClient.readContract({ address: pairAddr, abi: PAIR_ABI, functionName: 'getTokenY' }).catch(() => null),
        publicClient.readContract({ address: pairAddr, abi: PAIR_ABI, functionName: 'getReserves' }).catch(() => null),
        publicClient.readContract({ address: pairAddr, abi: PAIR_ABI, functionName: 'getActiveId' }).catch(() => null),
        publicClient.readContract({ address: pairAddr, abi: PAIR_ABI, functionName: 'getStaticFeeParameters' }).catch(() => null),
      ])

      if (!tokenXAddr || !tokenYAddr) return null

      const [tokenXMeta, tokenYMeta] = await Promise.all([
        resolveToken(tokenXAddr as string),
        resolveToken(tokenYAddr as string),
      ])

      const reserveX = (reserves as any)?.[0] ?? 0n
      const reserveY = (reserves as any)?.[1] ?? 0n
      const activeId  = activeIdRaw !== null ? Number(activeIdRaw as unknown as bigint) : 8388608
      const activePrice = binIdToPrice(activeId)

      const baseFactor = feeParamsRaw !== null ? Number((feeParamsRaw as any).baseFactor ?? 0) : 0
      const baseFee = baseFactor / 1e4

      const amountX = Number(BigInt(reserveX) * 10n ** BigInt(18 - tokenXMeta.decimals)) / 1e18
      const amountY = Number(BigInt(reserveY) * 10n ** BigInt(18 - tokenYMeta.decimals)) / 1e18

      const [priceX, priceY] = await Promise.all([
        getVerifiedPrice(tokenXMeta.symbol).catch(() => null),
        getVerifiedPrice(tokenYMeta.symbol).catch(() => null),
      ])

      const tvlUSD =
        (priceX?.bestPrice != null ? amountX * priceX.bestPrice : 0) +
        (priceY?.bestPrice != null ? amountY * priceY.bestPrice : 0)

      return {
        address:      pairAddr,
        tokenX:       tokenXAddr as string,
        tokenY:       tokenYAddr as string,
        tokenXSymbol: tokenXMeta.symbol,
        tokenYSymbol: tokenYMeta.symbol,
        reserveX:     BigInt(reserveX),
        reserveY:     BigInt(reserveY),
        activeId,
        activePrice,
        baseFee,
        tvlUSD,
        protocol:     'bean',
      } satisfies BeanPair
    })
  )

  return pairs.filter(Boolean) as BeanPair[]
}

/**
 * Looks up a Bean pair by tokenX and tokenY addresses.
 * If `binStep` is provided, calls `getLBPairInformation` directly.
 * If omitted, tries `getAllLBPairs` to find any existing pair.
 *
 * @param tokenX - Address of token X
 * @param tokenY - Address of token Y
 * @param binStep - Optional bin step (e.g. 25 for 0.25%)
 * @returns Pair address and metadata, or null if not found
 *
 * @category DEX
 */
export async function getBeanPair(
  tokenX: string,
  tokenY: string,
  binStep?: number,
): Promise<{ pairAddress: string; binStep: number; createdByOwner: boolean } | null> {
  try {
    if (binStep !== undefined) {
      const info = await publicClient.readContract({
        address:      BEAN_ADDRESSES.factory,
        abi:          FACTORY_ABI,
        functionName: 'getLBPairInformation',
        args:         [tokenX as `0x${string}`, tokenY as `0x${string}`, BigInt(binStep)],
      }) as { LBPair: string; binStep: number; createdByOwner: boolean }

      if (!info?.LBPair || info.LBPair === '0x0000000000000000000000000000000000000000') return null
      return { pairAddress: info.LBPair, binStep: Number(info.binStep), createdByOwner: info.createdByOwner }
    }

    const allPairs = await publicClient.readContract({
      address:      BEAN_ADDRESSES.factory,
      abi:          FACTORY_ABI,
      functionName: 'getAllLBPairs',
      args:         [tokenX as `0x${string}`, tokenY as `0x${string}`],
    }) as { LBPair: string; binStep: number; createdByOwner: boolean; ignoredForRouting: boolean }[]

    const active = allPairs.find(p => p.LBPair && p.LBPair !== '0x0000000000000000000000000000000000000000' && !p.ignoredForRouting)
    if (!active) return null
    return { pairAddress: active.LBPair, binStep: Number(active.binStep), createdByOwner: active.createdByOwner }
  } catch {
    return null
  }
}

/**
 * Returns total USD value locked across all Bean Exchange DLMM pairs.
 *
 * @returns Sum of tvlUSD across all fetched pairs
 *
 * @category DEX
 */
export async function getBeanTVL(): Promise<number> {
  const pairs = await getBeanPairs(100)
  return pairs.reduce((s, p) => s + p.tvlUSD, 0)
}
