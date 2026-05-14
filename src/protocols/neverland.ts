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
//   Reserves:     dynamic via getReservesList()
//
// Rate encoding:
//   All rates in RAY units (1e27).
//   APY = (1 + rate/1e27/SECONDS_PER_YEAR)^SECONDS_PER_YEAR - 1
//
// Configuration bitmask (Aave V3 standard):
//   bits 0-15:   LTV (basis points)
//   bits 16-31:  liquidation threshold (basis points)
//   bits 32-47:  liquidation bonus (basis points)
//   bits 64-79:  reserve factor (basis points)
//
// Verified rates (2026-04-17):
//   USDC supply APY: 3.87%  | borrow APY: 8.72%
//   liquidityIndex:  1.0152 (confirms live market with accumulated interest)

import { publicClient } from '../chain'
import { getVerifiedPrice } from './oracles'
import type { LendingRate, YieldComparison, StakingAPR } from '../types'

export const NEVERLAND_POOL = '0x80f00661b13cc5f6ccd3885be7b4c9c67545d585' as const

const RAY = BigInt('1000000000000000000000000000') // 1e27
const SECONDS_PER_YEAR = 365.25 * 24 * 3600

const NON_STABLE_SYMBOLS = new Set(['WMON', 'WETH', 'WBTC', 'MON'])

/** Convert ray-encoded rate to APY using compound formula */
function rayToAPY(rate: bigint): number {
  const ratePerSecond = Number(rate) / Number(RAY) / SECONDS_PER_YEAR
  return Math.pow(1 + ratePerSecond, SECONDS_PER_YEAR) - 1
}

/** Decode Aave V3 configuration bitmask */
function decodeConfiguration(config: bigint): {
  ltv: number
  liquidationThreshold: number
  liquidationBonus: number
  reserveFactor: number
} {
  const mask16 = BigInt(0xffff)
  return {
    ltv:                  Number((config) & mask16) / 100,
    liquidationThreshold: Number((config >> BigInt(16)) & mask16) / 100,
    liquidationBonus:     Number((config >> BigInt(32)) & mask16) / 100,
    reserveFactor:        Number((config >> BigInt(64)) & mask16) / 100,
  }
}

const POOL_ABI = [
  {
    name: 'getReservesList',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address[]' }],
  },
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

const ERC20_ABI = [
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
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const

export interface NeverlandLendingRate extends LendingRate {
  ltv:                  number
  liquidationThreshold: number
  liquidationBonus:     number
  reserveFactor:        number
}

/**
 * Returns supply and borrow APY for all Neverland reserve assets.
 *
 * Dynamically fetches reserves via `getReservesList()`, then reads
 * `getReserveData()` for each. Borrow totals come from `variableDebtToken.totalSupply()`.
 * Configuration bitmask is decoded for LTV and liquidation parameters.
 *
 * @returns Array of {@link NeverlandLendingRate} objects, one per active reserve
 *
 * @example
 * ```typescript
 * const rates = await getLendingRates()
 * // → [{ protocol: 'neverland', asset: 'USDC', supplyAPY: 0.0387, borrowAPR: 0.0872, ltv: 80, ... }]
 * ```
 *
 * @category Lending
 */
export async function getLendingRates(): Promise<NeverlandLendingRate[]> {
  let reserveAddresses: readonly `0x${string}`[]
  try {
    reserveAddresses = await publicClient.readContract({
      address: NEVERLAND_POOL as `0x${string}`,
      abi: POOL_ABI,
      functionName: 'getReservesList',
    }) as readonly `0x${string}`[]
  } catch {
    return []
  }

  if (!reserveAddresses || reserveAddresses.length === 0) return []

  const reserveDataResults = await publicClient.multicall({
    contracts: reserveAddresses.map(addr => ({
      address: NEVERLAND_POOL as `0x${string}`,
      abi: POOL_ABI,
      functionName: 'getReserveData',
      args: [addr],
    })),
    allowFailure: true,
  })

  const validReserves: {
    addr: `0x${string}`
    data: any
    aTokenAddr: `0x${string}`
    debtTokenAddr: `0x${string}`
  }[] = []

  reserveDataResults.forEach((r, i) => {
    if (r.status === 'success' && r.result) {
      const data = r.result as any
      const aAddr = data.aTokenAddress as string
      const dAddr = data.variableDebtTokenAddress as string
      if (aAddr && aAddr !== '0x0000000000000000000000000000000000000000') {
        validReserves.push({
          addr: reserveAddresses[i],
          data,
          aTokenAddr:  aAddr as `0x${string}`,
          debtTokenAddr: dAddr as `0x${string}`,
        })
      }
    }
  })

  if (validReserves.length === 0) return []

  const tokenContracts: { address: `0x${string}`; abi: typeof ERC20_ABI; functionName: string }[] = []
  for (const r of validReserves) {
    tokenContracts.push({ address: r.addr,          abi: ERC20_ABI, functionName: 'symbol'      })
    tokenContracts.push({ address: r.addr,          abi: ERC20_ABI, functionName: 'decimals'    })
    tokenContracts.push({ address: r.aTokenAddr,    abi: ERC20_ABI, functionName: 'totalSupply' })
    tokenContracts.push({ address: r.debtTokenAddr, abi: ERC20_ABI, functionName: 'totalSupply' })
  }

  const tokenResults = await publicClient.multicall({ contracts: tokenContracts, allowFailure: true })

  const rates: NeverlandLendingRate[] = []

  validReserves.forEach((reserve, i) => {
    const base = i * 4
    const symbolResult   = tokenResults[base]
    const decimalsResult = tokenResults[base + 1]
    const supplyResult   = tokenResults[base + 2]
    const debtResult     = tokenResults[base + 3]

    const symbol   = symbolResult.status   === 'success' ? String(symbolResult.result)   : `UNKNOWN_${i}`
    const decimals = decimalsResult.status === 'success' ? Number(decimalsResult.result)  : 18
    const divisor  = BigInt(10 ** decimals)

    const supplyRaw = supplyResult.status === 'success' ? supplyResult.result as bigint : BigInt(0)
    const debtRaw   = debtResult.status   === 'success' ? debtResult.result   as bigint : BigInt(0)

    const totalSupply = Number(supplyRaw / divisor) + Number(supplyRaw % divisor) / 10 ** decimals
    const totalBorrow = Number(debtRaw   / divisor) + Number(debtRaw   % divisor) / 10 ** decimals

    const configBig = BigInt(reserve.data.configuration)
    const decoded   = decodeConfiguration(configBig)

    rates.push({
      protocol: 'neverland',
      asset:    symbol,
      assetAddress: reserve.addr,
      supplyAPY:    rayToAPY(BigInt(reserve.data.currentLiquidityRate)),
      borrowAPR:    rayToAPY(BigInt(reserve.data.currentVariableBorrowRate)),
      utilizationRate: totalSupply > 0 && totalBorrow > 0
        ? totalBorrow / totalSupply
        : 0,
      totalSupply,
      totalBorrow,
      ltv:                  decoded.ltv,
      liquidationThreshold: decoded.liquidationThreshold,
      liquidationBonus:     decoded.liquidationBonus,
      reserveFactor:        decoded.reserveFactor,
    })
  })

  return rates
}

/**
 * Returns the Neverland reserve asset with the highest current supply APY.
 *
 * @returns The {@link NeverlandLendingRate} entry with the maximum `supplyAPY`
 *
 * @category Lending
 */
export async function getBestSupplyAsset(): Promise<NeverlandLendingRate> {
  const rates = await getLendingRates()
  return rates.reduce((best, r) => r.supplyAPY > best.supplyAPY ? r : best)
}

/**
 * Returns the Neverland reserve asset with the lowest current borrow APR.
 *
 * @returns The {@link NeverlandLendingRate} entry with the minimum `borrowAPR`
 *
 * @category Lending
 */
export async function getBestBorrowAsset(): Promise<NeverlandLendingRate> {
  const rates = await getLendingRates()
  return rates.reduce((best, r) => r.borrowAPR < best.borrowAPR ? r : best)
}

/**
 * Returns the total USD value supplied across all Neverland reserves.
 *
 * For stablecoin assets, counts totalSupply directly as USD.
 * For non-stablecoin assets (WMON, WETH, WBTC, MON), uses oracle price from
 * {@link getVerifiedPrice}. If price unavailable for a non-stable asset, that
 * asset is skipped (not counted as 0).
 *
 * @returns Total TVL in USD
 *
 * @category Lending
 */
export async function getNeverlandTVL(): Promise<number> {
  const rates = await getLendingRates()

  const pricePromises = rates.map(async (r) => {
    if (!NON_STABLE_SYMBOLS.has(r.asset)) {
      return { symbol: r.asset, supply: r.totalSupply, price: 1 }
    }
    try {
      const vp = await getVerifiedPrice(r.asset)
      return { symbol: r.asset, supply: r.totalSupply, price: vp.bestPrice }
    } catch {
      return null
    }
  })

  const resolved = await Promise.all(pricePromises)

  return resolved.reduce((sum, item) => {
    if (item === null) return sum
    return sum + item.supply * item.price
  }, 0)
}

/**
 * Compares aPriori staking APR against the best Neverland supply APY.
 *
 * @param stakingAPR - Staking APR result from `getStakingAPR()` in `apriori.ts`
 * @returns A {@link YieldComparison} with `staking`, `bestLending`, `recommendation`, and `reason`
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
