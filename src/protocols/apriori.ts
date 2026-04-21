/**
 * @module aPriori
 * @description Liquid staking protocol on Monad — ERC4626 vault issuing aprMON for staked MON.
 *
 * **TVL:** ~$28.6M
 * **Type:** Liquid Staking (ERC4626)
 * **Docs:** https://apriori.finance
 *
 * Available functions:
 * - {@link getAPrioriExchangeRate} — current aprMON→MON exchange rate
 * - {@link getAPrioriTVL} — total MON locked in aprMON vault
 * - {@link getStakingAPR} — full APR struct with multicall and rates
 * - {@link getAPrioriStats} — one-call summary of apr, tvl, exchangeRate
 */

// ============================================================
// Rampart SDK — aPriori Liquid Staking Module
// Contract: 0x0c65A0BC65a5D819235B71F554D210D3F80E0852 (Monad Mainnet)
// Standard ERC4626 vault — aprMON token
// ============================================================
//
// APR methodology (verified 2026-04-17):
//   Use exchange rate delta (convertToAssets), NOT totalAssets delta.
//   totalAssets can decrease when users unstake; exchange rate is monotonically increasing.
//   APR = (rate_now - rate_past) / rate_past * (BLOCKS_PER_YEAR / blockDelta)
//   Tested: 9.4% (8h window) / 9.6% (80h window) — both in expected 5-50% range.

import { publicClient, MONAD_BLOCKS_PER_YEAR } from '../chain'
import type { StakingAPR } from '../types'

export const APRIORI_CONTRACT = '0x0c65A0BC65a5D819235B71F554D210D3F80E0852' as const

// Function selectors
const SEL_TOTAL_ASSETS   = '0x01e1d114' as const  // totalAssets()
const SEL_TOTAL_SUPPLY   = '0x18160ddd' as const  // totalSupply()
const SEL_CONVERT_ASSETS = '0x07a2d13a' as const  // convertToAssets(uint256)

// ~8h of blocks at 400ms — enough for a stable APR window
const APR_BLOCK_DELTA = 72_000

function decodeUint256(hex: string): bigint {
  return BigInt(hex)
}

/**
 * Returns the current aprMON→MON exchange rate.
 *
 * Calls `convertToAssets(1e18)` on the ERC4626 vault to determine how many MON
 * wei are redeemable for 1 aprMON. The rate is monotonically increasing over time
 * as staking rewards accumulate.
 *
 * @returns Exchange rate as a float (e.g. `1.094` means 1 aprMON redeems for 1.094 MON)
 *
 * @example
 * ```typescript
 * const rate = await getAPrioriExchangeRate()
 * // → 1.094
 * ```
 *
 * @category LST
 */
export async function getAPrioriExchangeRate(): Promise<number> {
  // convertToAssets(1e18) — pass 1 aprMON worth of shares
  const ONE_APRIMON = '0000000000000000000000000000000000000000000000000de0b6b3a7640000'
  const result = await publicClient.call({
    to: APRIORI_CONTRACT,
    data: `${SEL_CONVERT_ASSETS}${ONE_APRIMON}`,
  })
  if (!result.data) throw new Error('getAPrioriExchangeRate: no data returned')
  return Number(decodeUint256(result.data)) / 1e18
}

/**
 * Returns the total MON locked in the aPriori vault.
 *
 * Reads `totalAssets()` from the ERC4626 contract. Note: `totalAssets` can
 * temporarily decrease when users unstake, so prefer {@link getStakingAPR} or
 * {@link getAPrioriStats} for APR calculation (which uses the exchange rate delta instead).
 *
 * @returns TVL in MON (human-readable float, e.g. `28600000`)
 *
 * @example
 * ```typescript
 * const tvl = await getAPrioriTVL()
 * // → 28600000
 * ```
 *
 * @category LST
 */
export async function getAPrioriTVL(): Promise<number> {
  const result = await publicClient.call({
    to: APRIORI_CONTRACT,
    data: SEL_TOTAL_ASSETS,
  })
  if (!result.data) throw new Error('getAPrioriTVL: no data returned')
  return Number(decodeUint256(result.data)) / 1e18
}

/**
 * Returns the annualised staking APR for aPriori.
 *
 * Compares the `convertToAssets` exchange rate at the current block versus
 * ~8 hours ago (72,000 blocks at 400 ms/block) to derive an annualised rate.
 * This avoids the `totalAssets` instability caused by unstaking events.
 *
 * @returns A {@link StakingAPR} with `protocol`, `apr`, `tvl`, `exchangeRate`, and `timestamp`
 *
 * @example
 * ```typescript
 * const { apr, tvl } = await getStakingAPR()
 * // → { protocol: 'apriori', apr: 0.094, tvl: 28600000, exchangeRate: 1.094, timestamp: ... }
 * ```
 *
 * @category LST
 */
export async function getStakingAPR(): Promise<StakingAPR> {
  const ONE_APRIMON = '0000000000000000000000000000000000000000000000000de0b6b3a7640000'
  const callData = `${SEL_CONVERT_ASSETS}${ONE_APRIMON}` as `0x${string}`

  const blockNow = await publicClient.getBlockNumber()
  const blockPast = blockNow - BigInt(APR_BLOCK_DELTA)

  const [rateNowResult, ratePastResult, tvlResult] = await Promise.all([
    publicClient.call({ to: APRIORI_CONTRACT, data: callData }),
    publicClient.call({ to: APRIORI_CONTRACT, data: callData, blockNumber: blockPast }),
    publicClient.call({ to: APRIORI_CONTRACT, data: SEL_TOTAL_ASSETS }),
  ])

  if (!rateNowResult.data || !ratePastResult.data || !tvlResult.data) {
    throw new Error('getStakingAPR: missing data from RPC')
  }

  const rateNow  = Number(decodeUint256(rateNowResult.data))
  const ratePast = Number(decodeUint256(ratePastResult.data))
  const tvlWei   = Number(decodeUint256(tvlResult.data))

  const apr = (rateNow - ratePast) / ratePast * (MONAD_BLOCKS_PER_YEAR / APR_BLOCK_DELTA)

  return {
    protocol: 'apriori',
    apr,
    tvl: tvlWei / 1e18,
    exchangeRate: rateNow / 1e18,
    timestamp: Date.now(),
  }
}

/**
 * Returns all aPriori stats in a single batched call — apr, tvl, and exchangeRate.
 *
 * More efficient than calling {@link getStakingAPR} and {@link getAPrioriTVL} separately.
 * Uses `publicClient.multicall` for `convertToAssets`, `totalAssets`, and `totalSupply`,
 * then fetches the past-block rate with a separate `eth_call` (multicall does not
 * support per-call block overrides).
 *
 * @returns Object with `apr` (annualised rate), `tvl` (MON), and `exchangeRate`
 *
 * @example
 * ```typescript
 * const stats = await getAPrioriStats()
 * // → { apr: 0.094, tvl: 28600000, exchangeRate: 1.094 }
 * ```
 *
 * @category LST
 */
export async function getAPrioriStats(): Promise<{ apr: number; tvl: number; exchangeRate: number }> {
  const ONE_APRIMON = '0000000000000000000000000000000000000000000000000de0b6b3a7640000'
  const callData = `${SEL_CONVERT_ASSETS}${ONE_APRIMON}` as `0x${string}`

  const blockNow = await publicClient.getBlockNumber()
  const blockPast = blockNow - BigInt(APR_BLOCK_DELTA)

  // Multicall: [rateNow, ratePast, totalAssets, totalSupply]
  const results = await publicClient.multicall({
    contracts: [
      { address: APRIORI_CONTRACT, abi: RAW_ABI, functionName: 'convertToAssets', args: [BigInt('1000000000000000000')] },
      { address: APRIORI_CONTRACT, abi: RAW_ABI, functionName: 'totalAssets' },
      { address: APRIORI_CONTRACT, abi: RAW_ABI, functionName: 'totalSupply' },
    ],
    allowFailure: false,
  })

  // Get past rate separately (multicall doesn't support block overrides per-call)
  const pastResult = await publicClient.call({
    to: APRIORI_CONTRACT,
    data: callData,
    blockNumber: blockPast,
  })

  const rateNow  = Number(results[0] as bigint)
  const tvlWei   = Number(results[1] as bigint)
  const ratePast = pastResult.data ? Number(decodeUint256(pastResult.data)) : rateNow

  const apr = ratePast > 0
    ? (rateNow - ratePast) / ratePast * (MONAD_BLOCKS_PER_YEAR / APR_BLOCK_DELTA)
    : 0

  return {
    apr,
    tvl: tvlWei / 1e18,
    exchangeRate: rateNow / 1e18,
  }
}

// Minimal ABI for multicall
const RAW_ABI = [
  {
    name: 'convertToAssets',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'shares', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'totalAssets',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'totalSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const
