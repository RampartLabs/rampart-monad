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
} as const

const POOL_ABI = [
  { name: 'totalSupply',     type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'totalPoolWorth',  type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'poolAsset',       type: 'function' as const, inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
] as const

const ERC20_ABI = [
  { name: 'symbol',   type: 'function' as const, inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' as const },
  { name: 'decimals', type: 'function' as const, inputs: [], outputs: [{ type: 'uint8' }],  stateMutability: 'view' as const },
] as const

export interface NablaPool {
  address:      string
  name:         string
  asset:        string
  totalSupply:  number   // LP share supply
  tvlUSD:       number
  protocol:     'nabla'
}

async function fetchNablaPool(addr: `0x${string}`, label: string): Promise<NablaPool> {
  const [worthRaw, assetAddrRaw, totalSupplyRaw] = await Promise.allSettled([
    publicClient.readContract({ address: addr, abi: POOL_ABI, functionName: 'totalPoolWorth' }),
    publicClient.readContract({ address: addr, abi: POOL_ABI, functionName: 'poolAsset' }),
    publicClient.readContract({ address: addr, abi: POOL_ABI, functionName: 'totalSupply' }),
  ])

  const tvlRaw    = worthRaw.status   === 'fulfilled' ? Number(worthRaw.value as bigint) : 0
  const assetAddr = assetAddrRaw.status === 'fulfilled' ? (assetAddrRaw.value as string) : ''

  let assetSymbol = 'USDC'
  let decimals    = 6
  if (assetAddr) {
    const [sym, dec] = await Promise.allSettled([
      publicClient.readContract({ address: assetAddr as `0x${string}`, abi: ERC20_ABI, functionName: 'symbol' }),
      publicClient.readContract({ address: assetAddr as `0x${string}`, abi: ERC20_ABI, functionName: 'decimals' }),
    ])
    if (sym.status === 'fulfilled') assetSymbol = sym.value as string
    if (dec.status === 'fulfilled') decimals    = Number(dec.value as number)
  }

  const tvlUSD      = tvlRaw / (10 ** decimals)
  const totalSupply = totalSupplyRaw.status === 'fulfilled' ? Number(totalSupplyRaw.value as bigint) / (10 ** decimals) : 0
  return { address: addr, name: label, asset: assetSymbol, totalSupply, tvlUSD, protocol: 'nabla' }
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
export async function getNablaPools(): Promise<NablaPool[]> {
  const [backstop] = await Promise.allSettled([
    fetchNablaPool(NABLA_ADDRESSES.BackstopPool, 'Nabla Backstop'),
  ])

  return [backstop].flatMap(r => r.status === 'fulfilled' ? [r.value as NablaPool] : [])
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
