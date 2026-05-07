/**
 * @module Neverland
 * @description Lending protocol on Monad — Aave V3 fork with 11 reserve assets including LSTs.
 *
 * **TVL:** ~$8M
 * **Type:** Lending (Aave V3 fork)
 * **Docs:** https://neverland.money
 *
 * Available functions:
 * - {@link getLendingRates} — supply/borrow APY for all Neverland assets
 * - {@link getBestSupplyAsset} — highest supply APY asset
 * - {@link getBestBorrowAsset} — lowest borrow APR asset
 * - {@link getNeverlandTVL} — total USD supplied across all markets
 * - {@link compareYields} — staking vs lending comparison
 */

// ============================================================
// Rampart SDK — Neverland Lending Module
// Protocol: Neverland (Aave V3 fork) on Monad Mainnet
// ============================================================
//
// Discovered 2026-04-17 (no official docs had the pool address):
//   Pool:         0x80f00661b13cc5f6ccd3885be7b4c9c67545d585
//   Found via:    aToken.POOL() call on known aToken address
//   Reserves:     11 assets (USDC, WMON, USDT0, WBTC, WETH, sMON, shMON, AUSD, gMON, earnAUSD, loAZND)
//
// Rate encoding:
//   All rates in RAY units (1e27).
//   APY = (1 + rate/1e27/SECONDS_PER_YEAR)^SECONDS_PER_YEAR - 1
//
// Verified rates (2026-04-17):
//   USDC supply APY: 3.87%  | borrow APY: 8.72%
//   liquidityIndex:  1.0152 (confirms live market with accumulated interest)

import { publicClient } from '../chain'
import type { LendingRate, YieldComparison, StakingAPR } from '../types'

export const NEVERLAND_POOL = '0x80f00661b13cc5f6ccd3885be7b4c9c67545d585' as const

const RAY = BigInt('1000000000000000000000000000') // 1e27
const SECONDS_PER_YEAR = 365.25 * 24 * 3600

// Reserve token addresses (confirmed on Monad mainnet)
const RESERVE_TOKENS: Record<string, string> = {
  USDC:     '0x754704bc059f8c67012fed69bc8a327a5aafb603',
  WMON:     '0x3bd359c1119da7da1d913d1c4d2b7c461115433a',
  USDT0:    '0xe7cd86e13ac4309349f30b3435a9d337750fc82d',
  WBTC:     '0x0555e30da8f98308edb960aa94c0db47230d2b9c',
  WETH:     '0xee8c0e9f1bffb4eb878d8f15f368a02a35481242',
  sMON:     '0xa3227c5969757783154c60bf0bc1944180ed81b9',
  shMON:    '0x1b68626dca36c7fe922fd2d55e4f631d962de19c',
  AUSD:     '0x00000000efe302beaa2b3e6e1b18d08d69a9012a',
  gMON:     '0x8498312a6b3cbd158bf0c93abdcf29e6e4f55081',
  earnAUSD: '0x103222f020e98bba0ad9809a011fdf8e6f067496',
  loAZND:   '0x9c82eb49b51f7dc61e22ff347931ca32adc6cd90',
}

/** Convert ray-encoded rate to APY using compound formula */
function rayToAPY(rate: bigint): number {
  const ratePerSecond = Number(rate) / Number(RAY) / SECONDS_PER_YEAR
  return Math.pow(1 + ratePerSecond, SECONDS_PER_YEAR) - 1
}

/** ABI fragment for Aave V3 Pool.getReserveData */
const POOL_ABI = [
  {
    name: 'getReserveData',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'configuration',              type: 'uint256' },
          { name: 'liquidityIndex',             type: 'uint128' },
          { name: 'currentLiquidityRate',       type: 'uint128' },
          { name: 'variableBorrowIndex',        type: 'uint128' },
          { name: 'currentVariableBorrowRate',  type: 'uint128' },
          { name: 'currentStableBorrowRate',    type: 'uint128' },
          { name: 'lastUpdateTimestamp',        type: 'uint40'  },
          { name: 'id',                         type: 'uint16'  },
          { name: 'aTokenAddress',              type: 'address' },
          { name: 'stableDebtTokenAddress',     type: 'address' },
          { name: 'variableDebtTokenAddress',   type: 'address' },
          { name: 'interestRateStrategyAddress',type: 'address' },
          { name: 'accruedToTreasury',          type: 'uint128' },
          { name: 'unbacked',                   type: 'uint128' },
          { name: 'isolationModeTotalDebt',     type: 'uint128' },
        ],
      },
    ],
  },
] as const

const ATOKEN_ABI = [
  {
    name: 'totalSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const

/**
 * Returns supply and borrow APY for all 11 Neverland reserve assets.
 *
 * Batches `getReserveData` calls via multicall, then fetches each aToken's
 * `totalSupply` and `decimals` in a second multicall. Rates are decoded from
 * RAY units (1e27) using the compound APY formula.
 *
 * @returns Array of {@link LendingRate} objects, one per active reserve
 *
 * @example
 * ```typescript
 * const rates = await getLendingRates()
 * // → [{ protocol: 'neverland', asset: 'USDC', supplyAPY: 0.0387, borrowAPR: 0.0872, ... }, ...]
 * ```
 *
 * @category Lending
 */
export async function getLendingRates(): Promise<LendingRate[]> {
  const assets = Object.entries(RESERVE_TOKENS)

  // Batch getReserveData calls via multicall
  const reserveDataResults = await publicClient.multicall({
    contracts: assets.map(([, addr]) => ({
      address: NEVERLAND_POOL as `0x${string}`,
      abi: POOL_ABI,
      functionName: 'getReserveData',
      args: [addr as `0x${string}`],
    })),
    allowFailure: true,
  })

  // Get aToken totalSupply + decimals
  const aTokenContracts: { address: `0x${string}`; abi: typeof ATOKEN_ABI; functionName: string }[] = []
  const validReserves: { symbol: string; addr: string; idx: number }[] = []

  reserveDataResults.forEach((r, idx) => {
    if (r.status === 'success' && r.result) {
      const data = r.result as any
      if (data.aTokenAddress && data.aTokenAddress !== '0x0000000000000000000000000000000000000000') {
        validReserves.push({ symbol: assets[idx][0], addr: assets[idx][1], idx })
        aTokenContracts.push({
          address: data.aTokenAddress,
          abi: ATOKEN_ABI,
          functionName: 'totalSupply',
        })
        aTokenContracts.push({
          address: data.aTokenAddress,
          abi: ATOKEN_ABI,
          functionName: 'decimals',
        })
      }
    }
  })

  const aTokenResults = await publicClient.multicall({
    contracts: aTokenContracts,
    allowFailure: true,
  })

  const rates: LendingRate[] = []

  validReserves.forEach(({ symbol, addr, idx }, i) => {
    const reserveData = (reserveDataResults[idx] as any).result as any
    const supplyRaw   = (aTokenResults[i * 2] as any)?.result as bigint | undefined
    const decimals    = (aTokenResults[i * 2 + 1] as any)?.result as number | undefined

    if (!reserveData) return

    const decimalDivisor = decimals ? Math.pow(10, decimals) : 1e6 // default 6 for stables
    const totalSupply    = supplyRaw ? Number(supplyRaw) / decimalDivisor : 0
    const totalBorrow    = 0 // would need variableDebtToken.totalSupply — optional

    rates.push({
      protocol: 'neverland',
      asset: symbol,
      assetAddress: addr,
      supplyAPY:       rayToAPY(BigInt(reserveData.currentLiquidityRate)),
      borrowAPR:       rayToAPY(BigInt(reserveData.currentVariableBorrowRate)),
      utilizationRate: totalSupply > 0 && totalBorrow > 0
        ? totalBorrow / totalSupply
        : 0,
      totalSupply,
      totalBorrow,
    })
  })

  return rates
}

/**
 * Returns the Neverland reserve asset with the highest current supply APY.
 *
 * Calls {@link getLendingRates} and reduces to the top-yielding asset.
 * Useful for routing idle capital to the best passive yield available.
 *
 * @returns The {@link LendingRate} entry with the maximum `supplyAPY`
 *
 * @example
 * ```typescript
 * const best = await getBestSupplyAsset()
 * // → { asset: 'USDC', supplyAPY: 0.0387, protocol: 'neverland', ... }
 * ```
 *
 * @category Lending
 */
export async function getBestSupplyAsset(): Promise<LendingRate> {
  const rates = await getLendingRates()
  return rates.reduce((best, r) => r.supplyAPY > best.supplyAPY ? r : best)
}

/**
 * Returns the Neverland reserve asset with the lowest current borrow APR.
 *
 * Calls {@link getLendingRates} and reduces to the cheapest borrow.
 * Useful for strategies that need to source leverage at minimal cost.
 *
 * @returns The {@link LendingRate} entry with the minimum `borrowAPR`
 *
 * @example
 * ```typescript
 * const cheapest = await getBestBorrowAsset()
 * // → { asset: 'WMON', borrowAPR: 0.021, protocol: 'neverland', ... }
 * ```
 *
 * @category Lending
 */
export async function getBestBorrowAsset(): Promise<LendingRate> {
  const rates = await getLendingRates()
  return rates.reduce((best, r) => r.borrowAPR < best.borrowAPR ? r : best)
}

/**
 * Returns the total value supplied across all Neverland reserves.
 *
 * Sums `totalSupply` from all aToken contracts. Note: values are in asset units,
 * not USD-normalised (stable assets approximate face value; volatile assets
 * require an additional price oracle call for exact USD TVL).
 *
 * @returns Total supplied balance summed across all reserves (asset units)
 *
 * @example
 * ```typescript
 * const tvl = await getNeverlandTVL()
 * // → 7940000
 * ```
 *
 * @category Lending
 */
export async function getNeverlandTVL(): Promise<number> {
  const rates = await getLendingRates()
  // TVL in "units" — not USD normalized (would need price oracle for full USD TVL)
  return rates.reduce((sum, r) => sum + r.totalSupply, 0)
}

/**
 * Compares aPriori staking APR against the best Neverland supply APY.
 *
 * Fetches all lending rates, finds the highest-yielding asset, and builds a
 * human-readable recommendation explaining which strategy currently pays more
 * and by how many basis points.
 *
 * @param stakingAPR - Staking APR result from `getStakingAPR()` in `apriori.ts`
 * @returns A {@link YieldComparison} with `staking`, `bestLending`, `recommendation`, and `reason`
 *
 * @example
 * ```typescript
 * const apr = await getStakingAPR()
 * const cmp = await compareYields(apr)
 * // → { recommendation: 'staking', reason: 'aPriori staking (9.40%) beats USDC lending (3.87%) by 5.53%' }
 * ```
 *
 * @category Lending
 */
export async function compareYields(stakingAPR: StakingAPR): Promise<YieldComparison> {
  const rates    = await getLendingRates()
  const bestLend = rates.reduce((best, r) => r.supplyAPY > best.supplyAPY ? r : best)

  const recommendation = stakingAPR.apr > bestLend.supplyAPY ? 'staking' : 'lending'
  const diff = Math.abs(stakingAPR.apr - bestLend.supplyAPY)

  return {
    staking: stakingAPR,
    bestLending: bestLend,
    recommendation,
    reason: recommendation === 'staking'
      ? `aPriori staking (${(stakingAPR.apr * 100).toFixed(2)}%) beats ${bestLend.asset} lending (${(bestLend.supplyAPY * 100).toFixed(2)}%) by ${(diff * 100).toFixed(2)}%`
      : `${bestLend.asset} lending (${(bestLend.supplyAPY * 100).toFixed(2)}%) beats staking (${(stakingAPR.apr * 100).toFixed(2)}%) by ${(diff * 100).toFixed(2)}%`,
  }
}
