/**
 * @module Balancer
 * @description Balancer V3 AMM pools on Monad Mainnet.
 * Pools and TVL are fetched from the Balancer REST API (api-v3.balancer.fi),
 * which avoids the Monad RPC 100-block eth_getLogs limit and the Vault V3
 * VaultExtension proxy complexity. On-chain reads (swap fee, weights) are
 * layered on top for pools that need extra metadata.
 *
 * **TVL:** ~$10.5M
 * **Type:** Weighted / Stable / Surge AMM (Balancer V3)
 * **Docs:** https://docs.balancer.fi
 *
 * Available functions:
 * - {@link getBalancerPools} — all Balancer V3 pools on Monad, sorted by TVL
 * - {@link getBalancerTVL} — total USD locked across all Balancer pools
 */

import { publicClient } from '../chain'

const BALANCER_API   = 'https://api-v3.balancer.fi/'
const MONAD_CHAIN    = 'MONAD'

const WEIGHTED_FACTORY = '0x4bdCc2fb18AEb9e2d281b0278D946445070EAda7' as `0x${string}`
const STABLE_FACTORY   = '0xf5CDdF6feD9C589f1Be04899F48f9738531daD59' as `0x${string}`

const POOL_ABI = [
  { name: 'getSwapFeePercentage', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256'   }], stateMutability: 'view' as const },
  { name: 'getNormalizedWeights', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256[]' }], stateMutability: 'view' as const },
] as const

export interface BalancerPool {
  address:      string
  type:         'weighted' | 'stable' | 'boosted' | 'gyroscope' | 'lbp' | 'reclmm' | 'unknown'
  tokens:       string[]
  balances:     number[]
  swapFee:      number
  weights:      number[]
  tvlUSD:       number
  volume24h:    number
  fees24h:      number
  totalShares:  number
  holdersCount: number
  totalApr:     number
  swapFeeApr:   number
  stakingApr:   number
  protocolApr:  number
  protocol:     'balancer'
}

interface AprItem {
  apr:   number | string
  title: string
  type:  string
}

interface ApiPool {
  address:     string
  name:        string
  type:        string
  dynamicData: {
    totalShares?:    string
    swapFee?:        string
    totalLiquidity?: string
    volume24h?:      string
    fees24h?:        string
    holdersCount?:   number
    aprItems?:       AprItem[]
  }
  poolTokens:  { address: string; symbol: string; decimals: number; balance: string }[]
}

function normalizeType(apiType: string): BalancerPool['type'] {
  const t = apiType?.toLowerCase() ?? ''
  if (t.includes('weighted'))                    return 'weighted'
  if (t.includes('stable') || t.includes('surge')) return 'stable'
  if (t.includes('boosted'))                     return 'boosted'
  if (t.includes('gyro'))                        return 'gyroscope'
  if (t.includes('lbp'))                         return 'lbp'
  if (t.includes('reclmm') || t.includes('reclam')) return 'reclmm'
  return 'unknown'
}

function parseAprItems(items: AprItem[] | undefined): Pick<BalancerPool, 'totalApr' | 'swapFeeApr' | 'stakingApr' | 'protocolApr'> {
  if (!items || items.length === 0) {
    return { totalApr: 0, swapFeeApr: 0, stakingApr: 0, protocolApr: 0 }
  }
  let swapFeeApr = 0
  let stakingApr = 0
  let protocolApr = 0
  for (const item of items) {
    const apr = typeof item.apr === 'string' ? parseFloat(item.apr) : (item.apr ?? 0)
    const type = (item.type ?? '').toLowerCase()
    const title = (item.title ?? '').toLowerCase()
    if (type === 'swap_fee' || title.includes('swap fee')) {
      swapFeeApr += apr
    } else if (type === 'staking' || title.includes('staking') || title.includes('reward')) {
      stakingApr += apr
    } else if (type === 'protocol' || title.includes('protocol') || title.includes('bal ')) {
      protocolApr += apr
    } else {
      swapFeeApr += apr
    }
  }
  const totalApr = swapFeeApr + stakingApr + protocolApr
  return { totalApr, swapFeeApr, stakingApr, protocolApr }
}

async function fetchPoolsFromApi(maxPools: number): Promise<ApiPool[]> {
  const query = `{
    poolGetPools(first: ${maxPools}, where: { chainIn: [${MONAD_CHAIN}] }) {
      address
      name
      type
      dynamicData {
        swapFee
        totalLiquidity
        volume24h
        fees24h
        holdersCount
        aprItems { apr title type }
      }
      poolTokens { address symbol decimals balance }
    }
  }`
  try {
    const res = await fetch(BALANCER_API, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ query }),
    })
    if (!res.ok) return []
    const { data } = await res.json() as { data?: { poolGetPools?: ApiPool[] } }
    return data?.poolGetPools ?? []
  } catch {
    return []
  }
}

/**
 * Discovers and returns all Balancer V3 pools on Monad, sorted by TVL.
 *
 * Data is sourced from the Balancer REST API, which indexes all factories and
 * pool types (Weighted, Stable, Surge/StableSurge, reCLAMM, Boosted, Gyroscope, LBP)
 * and provides USD-denominated TVL, volume, fees, and APR directly.
 *
 * @param maxPools - Maximum number of pools to return (default 100)
 * @returns Array of {@link BalancerPool} sorted descending by `tvlUSD`
 *
 * @example
 * ```typescript
 * const pools = await getBalancerPools()
 * // → [{ type: 'stable', tokens: ['wnAUSD', 'wnUSDC', 'wnUSDT0'], tvlUSD: 8317224, totalApr: 0.045 }]
 * ```
 *
 * @category DEX
 */
export async function getBalancerPools(maxPools = 100): Promise<BalancerPool[]> {
  const apiPools = await fetchPoolsFromApi(maxPools)
  if (apiPools.length === 0) return []

  const results = await Promise.allSettled(
    apiPools.map(async (p) => {
      const tokens      = p.poolTokens.map(t => t.symbol)
      const balances    = p.poolTokens.map(t => parseFloat(t.balance ?? '0'))
      const tvlUSD      = parseFloat(p.dynamicData?.totalLiquidity ?? '0')
      const volume24h   = parseFloat(p.dynamicData?.volume24h ?? '0')
      const fees24h     = parseFloat(p.dynamicData?.fees24h ?? '0')
      const holdersCount = p.dynamicData?.holdersCount ?? 0
      const totalShares  = parseFloat(p.dynamicData?.totalShares ?? '0')
      const type        = normalizeType(p.type)
      const swapFeeApi  = parseFloat(p.dynamicData?.swapFee ?? '0')
      const aprBreakdown = parseAprItems(p.dynamicData?.aprItems)

      const [swapFeeRaw, weightsRaw] = await Promise.all([
        swapFeeApi === 0
          ? publicClient.readContract({ address: p.address as `0x${string}`, abi: POOL_ABI, functionName: 'getSwapFeePercentage' }).catch(() => null)
          : Promise.resolve(null),
        type === 'weighted'
          ? publicClient.readContract({ address: p.address as `0x${string}`, abi: POOL_ABI, functionName: 'getNormalizedWeights' }).catch(() => null)
          : Promise.resolve(null),
      ])

      const swapFee = swapFeeRaw !== null
        ? Number(swapFeeRaw as bigint) / 1e18
        : swapFeeApi

      return {
        address: p.address,
        type,
        tokens,
        balances,
        swapFee,
        weights:      weightsRaw !== null ? (weightsRaw as bigint[]).map(w => Number(w) / 1e18) : [],
        tvlUSD,
        volume24h,
        fees24h,
        totalShares,
        holdersCount,
        ...aprBreakdown,
        protocol: 'balancer' as const,
      }
    })
  )

  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as PromiseFulfilledResult<BalancerPool>).value)
    .sort((a, b) => b.tvlUSD - a.tvlUSD)
}

/**
 * Returns total USD value locked across all Balancer V3 pools on Monad.
 *
 * @returns Total TVL in USD as a plain number
 *
 * @example
 * ```typescript
 * const tvl = await getBalancerTVL()
 * // → 10499095
 * ```
 *
 * @category DEX
 */
export async function getBalancerTVL(): Promise<number> {
  const pools = await getBalancerPools()
  return pools.reduce((s, p) => s + p.tvlUSD, 0)
}

export { WEIGHTED_FACTORY, STABLE_FACTORY }
