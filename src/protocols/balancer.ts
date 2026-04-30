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

// BasePoolFactory ABI — for supplementary on-chain reads
const POOL_ABI = [
  { name: 'getSwapFeePercentage', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256'   }], stateMutability: 'view' as const },
  { name: 'getNormalizedWeights', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256[]' }], stateMutability: 'view' as const },
] as const

export interface BalancerPool {
  address:   string
  type:      'weighted' | 'stable' | 'unknown'
  tokens:    string[]
  balances:  number[]
  swapFee:   number
  weights:   number[]
  tvlUSD:    number
  protocol:  'balancer'
}

interface ApiPool {
  address:     string
  name:        string
  type:        string
  dynamicData: { swapFee?: string; totalLiquidity?: string }
  poolTokens:  { address: string; symbol: string; decimals: number; balance: string }[]
}

function normalizeType(apiType: string): 'weighted' | 'stable' | 'unknown' {
  const t = apiType?.toLowerCase() ?? ''
  if (t.includes('weighted')) return 'weighted'
  if (t.includes('stable') || t.includes('surge'))  return 'stable'
  return 'unknown'
}

async function fetchPoolsFromApi(maxPools: number): Promise<ApiPool[]> {
  const query = `{
    poolGetPools(first: ${maxPools}, where: { chainIn: [${MONAD_CHAIN}] }) {
      address
      name
      type
      dynamicData { swapFee totalLiquidity }
      poolTokens   { address symbol decimals balance }
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
 * pool types (Weighted, Stable, Surge/StableSurge, reCLAMM, Boosted) and
 * provides USD-denominated TVL directly — no on-chain getLogs or Vault calls needed.
 *
 * @param maxPools - Maximum number of pools to return (default 100)
 * @returns Array of {@link BalancerPool} sorted descending by `tvlUSD`
 *
 * @example
 * ```typescript
 * const pools = await getBalancerPools()
 * // → [{ type: 'stable', tokens: ['wnAUSD', 'wnUSDC', 'wnUSDT0'], tvlUSD: 8317224 }]
 * ```
 *
 * @category DEX
 */
export async function getBalancerPools(maxPools = 100): Promise<BalancerPool[]> {
  const apiPools = await fetchPoolsFromApi(maxPools)
  if (apiPools.length === 0) return []

  const results = await Promise.allSettled(
    apiPools.map(async (p) => {
      const tokens   = p.poolTokens.map(t => t.symbol)
      const balances = p.poolTokens.map(t => parseFloat(t.balance ?? '0'))
      const tvlUSD   = parseFloat(p.dynamicData?.totalLiquidity ?? '0')
      const type     = normalizeType(p.type)

      const swapFeeApi = parseFloat(p.dynamicData?.swapFee ?? '0')

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
        address:  p.address,
        type,
        tokens,
        balances,
        swapFee,
        weights:  weightsRaw !== null ? (weightsRaw as bigint[]).map(w => Number(w) / 1e18) : [],
        tvlUSD,
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
