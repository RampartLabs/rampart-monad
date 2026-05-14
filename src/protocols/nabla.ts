/**
 * @module Nabla
 * @description Nabla Finance — single-sided AMM on Monad. LPs deposit one asset
 * into a swap pool and earn fees without holding the paired asset. A separate
 * backstop pool absorbs impermanent loss risk, making LP exposure more predictable.
 *
 * **TVL:** ~$1M
 * **Type:** Single-Sided AMM
 * **Docs:** https://docs.nabla.fi
 *
 * Available functions:
 * - {@link getNablaPools} — list of Nabla pools with TVL
 * - {@link getNablaTVL} — aggregate TVL across all pools
 */

// ============================================================
// Rampart SDK — Nabla Finance on Monad
// AMM with backstop liquidity pools for single-sided stablecoin exposure.
// Source: github.com/monad-crypto/protocols/mainnet/nabla.jsonc
// ============================================================

import { publicClient } from '../chain'

export const NABLA_ADDRESSES = {
  Router:       '0x610748f49774C062467c7AE1eC9E4729FFE94577' as `0x${string}`,
  BackstopPool: '0x11B06EF8Adc5ea73841023CB39Be614f471213cc' as `0x${string}`,
  SwapPoolWETH: '0xd7B645e5027A010899A95bE464e880d58eCf6d76' as `0x${string}`,
  SwapPoolWBTC: '0xC1EB061De61f3B23D17cF61d1E890D53070dee62' as `0x${string}`,
  SwapPoolUSDC: '0xAe0cC253F27f0e80556e911E56FC4806Ac6a1508' as `0x${string}`,
  SwapPoolWMON: '0x12243c1cdb211813776d58DdBC1B59237b447919' as `0x${string}`,
} as const

const POOL_ABI = [
  { name: 'totalSupply',    type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'totalPoolWorth', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'poolAsset',      type: 'function' as const, inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
  { name: 'reserve',        type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'coverage',       type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  {
    name: 'swapFees',
    type: 'function' as const,
    inputs: [],
    outputs: [
      { name: 'lpFee_',        type: 'uint256' },
      { name: 'backstopFee_',  type: 'uint256' },
      { name: 'protocolFee_',  type: 'uint256' },
    ],
    stateMutability: 'view' as const,
  },
] as const

const ROUTER_ABI = [
  {
    name: 'getAmountOut',
    type: 'function' as const,
    inputs: [
      { name: 'tokenIn',   type: 'address' },
      { name: 'tokenOut',  type: 'address' },
      { name: 'amountIn',  type: 'uint256' },
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view' as const,
  },
] as const

const ERC20_ABI = [
  { name: 'symbol',   type: 'function' as const, inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' as const },
  { name: 'decimals', type: 'function' as const, inputs: [], outputs: [{ type: 'uint8' }],  stateMutability: 'view' as const },
] as const

export interface NablaPool {
  address:      string
  name:         string
  asset:        string
  totalSupply:  number
  tvlUSD:       number
  protocol:     'nabla'
}

export interface NablaSwapPool extends NablaPool {
  reserve:      number
  coverage:     number
  lpFee:        number
  backstopFee:  number
  protocolFee:  number
  poolType:     'swap'
}

async function resolveAsset(assetAddr: string): Promise<{ symbol: string; decimals: number }> {
  if (!assetAddr) return { symbol: '', decimals: 18 }
  const [sym, dec] = await Promise.allSettled([
    publicClient.readContract({ address: assetAddr as `0x${string}`, abi: ERC20_ABI, functionName: 'symbol' }),
    publicClient.readContract({ address: assetAddr as `0x${string}`, abi: ERC20_ABI, functionName: 'decimals' }),
  ])
  return {
    symbol:   sym.status === 'fulfilled' ? (sym.value as string) : '',
    decimals: dec.status === 'fulfilled' ? Number(dec.value as number) : 18,
  }
}

async function fetchNablaPool(addr: `0x${string}`, label: string): Promise<NablaPool> {
  const [worthRaw, assetAddrRaw, totalSupplyRaw] = await Promise.allSettled([
    publicClient.readContract({ address: addr, abi: POOL_ABI, functionName: 'totalPoolWorth' }),
    publicClient.readContract({ address: addr, abi: POOL_ABI, functionName: 'poolAsset' }),
    publicClient.readContract({ address: addr, abi: POOL_ABI, functionName: 'totalSupply' }),
  ])

  const assetAddr  = assetAddrRaw.status === 'fulfilled' ? (assetAddrRaw.value as string) : ''
  const { symbol: assetSymbol, decimals } = await resolveAsset(assetAddr)
  const divisor    = 10n ** BigInt(decimals)
  const tvlRaw     = worthRaw.status      === 'fulfilled' ? (worthRaw.value as bigint) : 0n
  const tvlUSD     = Number(tvlRaw * 1_000_000n / divisor) / 1_000_000
  const totalSupply = totalSupplyRaw.status === 'fulfilled' ? Number((totalSupplyRaw.value as bigint) * 1_000_000n / divisor) / 1_000_000 : 0
  return { address: addr, name: label, asset: assetSymbol, totalSupply, tvlUSD, protocol: 'nabla' }
}

async function fetchNablaSwapPool(addr: `0x${string}`, label: string): Promise<NablaSwapPool> {
  const [worthRaw, assetAddrRaw, totalSupplyRaw, reserveRaw, coverageRaw, feesRaw] = await Promise.allSettled([
    publicClient.readContract({ address: addr, abi: POOL_ABI, functionName: 'totalPoolWorth' }),
    publicClient.readContract({ address: addr, abi: POOL_ABI, functionName: 'poolAsset' }),
    publicClient.readContract({ address: addr, abi: POOL_ABI, functionName: 'totalSupply' }),
    publicClient.readContract({ address: addr, abi: POOL_ABI, functionName: 'reserve' }),
    publicClient.readContract({ address: addr, abi: POOL_ABI, functionName: 'coverage' }),
    publicClient.readContract({ address: addr, abi: POOL_ABI, functionName: 'swapFees' }),
  ])

  const assetAddr  = assetAddrRaw.status === 'fulfilled' ? (assetAddrRaw.value as string) : ''
  const { symbol: assetSymbol, decimals } = await resolveAsset(assetAddr)
  const divisor    = 10n ** BigInt(decimals)
  const tvlRaw     = worthRaw.status    === 'fulfilled' ? (worthRaw.value    as bigint) : 0n
  const reserveVal = reserveRaw.status  === 'fulfilled' ? (reserveRaw.value  as bigint) : 0n
  const tvlUSD      = Number(tvlRaw     * 1_000_000n / divisor) / 1_000_000
  const totalSupply = totalSupplyRaw.status === 'fulfilled' ? Number((totalSupplyRaw.value as bigint) * 1_000_000n / divisor) / 1_000_000 : 0
  const reserve     = Number(reserveVal * 1_000_000n / divisor) / 1_000_000
  const coverage    = coverageRaw.status === 'fulfilled' ? Number(coverageRaw.value as bigint) / 1e18 : 0

  const FEES_SCALE = 10_000_000
  let lpFee = 0, backstopFee = 0, protocolFee = 0
  if (feesRaw.status === 'fulfilled') {
    const [lp, bs, pf] = feesRaw.value as [bigint, bigint, bigint]
    lpFee       = Number(lp) / FEES_SCALE
    backstopFee = Number(bs) / FEES_SCALE
    protocolFee = Number(pf) / FEES_SCALE
  }

  return { address: addr, name: label, asset: assetSymbol, totalSupply, tvlUSD, reserve, coverage, lpFee, backstopFee, protocolFee, poolType: 'swap', protocol: 'nabla' }
}

/**
 * Returns Nabla Finance pool stats on Monad.
 *
 * Fetches the BackstopPool's `totalPoolWorth` and `poolAsset`, resolves the
 * underlying asset's symbol and decimals, then normalises TVL. Additional swap
 * pools can be added to the internal `fetchNablaPool` calls.
 *
 * @returns Array of {@link NablaPool} objects (currently the BackstopPool only).
 *
 * @example
 * ```typescript
 * const pools = await getNablaPools()
 * // → [{ address: '0x...', name: 'Nabla Backstop', asset: 'USDC', tvlUSD: 1000000, ... }]
 * ```
 *
 * @category DEX
 */
export async function getNablaSwapPools(): Promise<NablaSwapPool[]> {
  const swapPoolDefs: [`0x${string}`, string][] = [
    [NABLA_ADDRESSES.SwapPoolWETH, 'Nabla WETH'],
    [NABLA_ADDRESSES.SwapPoolWBTC, 'Nabla WBTC'],
    [NABLA_ADDRESSES.SwapPoolUSDC, 'Nabla USDC'],
    [NABLA_ADDRESSES.SwapPoolWMON, 'Nabla WMON'],
  ]
  const results = await Promise.allSettled(
    swapPoolDefs.map(([addr, label]) => fetchNablaSwapPool(addr, label))
  )
  return results.flatMap(r => r.status === 'fulfilled' ? [r.value] : [])
}

export async function getNablaPools(): Promise<NablaPool[]> {
  const [backstopResult, swapPools] = await Promise.allSettled([
    fetchNablaPool(NABLA_ADDRESSES.BackstopPool, 'Nabla Backstop'),
    getNablaSwapPools(),
  ])

  const pools: NablaPool[] = []
  if (backstopResult.status === 'fulfilled') pools.push(backstopResult.value)
  if (swapPools.status      === 'fulfilled') pools.push(...swapPools.value)
  return pools
}

export async function getNablaAmountOut(
  tokenIn: `0x${string}`,
  tokenOut: `0x${string}`,
  amountIn: bigint
): Promise<bigint> {
  const result = await publicClient.readContract({
    address: NABLA_ADDRESSES.Router,
    abi: ROUTER_ABI,
    functionName: 'getAmountOut',
    args: [tokenIn, tokenOut, amountIn],
  }).catch(() => null)
  return result !== null ? (result as bigint) : 0n
}

/**
 * Returns total Nabla Finance TVL on Monad in USD.
 *
 * Calls {@link getNablaPools} and sums `tvlUSD` across all returned pools.
 *
 * @returns Total TVL as a float (USD).
 *
 * @example
 * ```typescript
 * const tvl = await getNablaTVL()
 * // → 1000000
 * ```
 *
 * @category DEX
 */
export async function getNablaTVL(): Promise<number> {
  const pools = await getNablaPools()
  return pools.reduce((s, p) => s + p.tvlUSD, 0)
}
