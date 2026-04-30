/**
 * @module Balancer
 * @description Balancer V3 weighted and stable AMM pools on Monad Mainnet.
 * Pools are discovered on-chain via factory `PoolCreated` events; TVL is priced
 * using stablecoin balances and the verified MON/USD rate from the oracle module.
 *
 * **TVL:** ~$500K
 * **Type:** Weighted / Stable AMM (Balancer V3)
 * **Docs:** https://docs.balancer.fi
 *
 * Available functions:
 * - {@link getBalancerPools} — all Balancer V3 pools on Monad, sorted by TVL
 * - {@link getBalancerTVL} — total USD locked across all Balancer pools
 */

import { publicClient } from '../chain'
import { getVerifiedPrice } from './oracles'

const BALANCER_VAULT:           `0x${string}` = '0xbA1333333333a1BA1108E8412f11850A5C319bA9'
const WEIGHTED_POOL_FACTORY:    `0x${string}` = '0x4bdCc2fb18AEb9e2d281b0278D946445070EAda7'
const STABLE_POOL_FACTORY:      `0x${string}` = '0xf5CDdF6feD9C589f1Be04899F48f9738531daD59'

const STABLE_SYMBOLS = new Set(['USDC', 'USDT', 'USDT0', 'AUSD', 'DAI'])
const WMON_SYMBOLS   = new Set(['WMON', 'MON'])

const VAULT_ABI = [
  { name: 'getPoolTokens', type: 'function' as const,
    inputs:  [{ name: 'pool', type: 'address' }],
    outputs: [{ name: 'tokens', type: 'address[]' }, { name: 'balancesRaw', type: 'uint256[]' }, { name: 'lastLiveBalances', type: 'uint256[]' }],
    stateMutability: 'view' as const },
] as const

const POOL_CREATED_EVENT = [{
  name: 'PoolCreated',
  type: 'event' as const,
  inputs: [{ name: 'pool', type: 'address', indexed: true }],
}] as const

const ERC20_ABI = [
  { name: 'symbol',   type: 'function' as const, inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' as const },
  { name: 'decimals', type: 'function' as const, inputs: [], outputs: [{ type: 'uint8'  }], stateMutability: 'view' as const },
] as const

export interface BalancerPool {
  address:   string
  type:      'weighted' | 'stable' | 'unknown'
  tokens:    string[]
  balances:  number[]
  tvlUSD:    number
  protocol:  'balancer'
}

async function discoverPools(): Promise<{ address: `0x${string}`; type: 'weighted' | 'stable' }[]> {
  const discovered: { address: `0x${string}`; type: 'weighted' | 'stable' }[] = []
  for (const [factory, type] of [
    [WEIGHTED_POOL_FACTORY, 'weighted' as const],
    [STABLE_POOL_FACTORY,   'stable'   as const],
  ] as const) {
    try {
      const logs = await publicClient.getLogs({
        address:   factory,
        event:     POOL_CREATED_EVENT[0],
        fromBlock: 1n,
        toBlock:   'latest',
      })
      logs.forEach(l => {
        const pool = (l.args as any).pool as `0x${string}`
        if (pool) discovered.push({ address: pool, type })
      })
    } catch { }
  }
  return discovered
}

/**
 * Discovers and returns all Balancer V3 weighted and stable pools on Monad, sorted by TVL.
 *
 * Queries both the weighted and stable pool factories for `PoolCreated` events, then
 * fetches token metadata and balances from the Balancer Vault via multicall. TVL is
 * computed from stablecoin balances plus WMON/MON balances priced at the verified rate.
 *
 * @returns Array of {@link BalancerPool} objects sorted descending by `tvlUSD`
 *
 * @example
 * ```typescript
 * const pools = await getBalancerPools()
 * // → [{ address: '0x...', type: 'weighted', tokens: ['WMON', 'USDC'], tvlUSD: 120000, ... }]
 * ```
 *
 * @category DEX
 */
export async function getBalancerPools(): Promise<BalancerPool[]> {
  const pools  = await discoverPools()
  if (pools.length === 0) return []

  const monPrice = await getVerifiedPrice('MON')

  const results = await Promise.allSettled(
    pools.map(async ({ address, type }) => {
      const poolResult = await publicClient.readContract({
        address: BALANCER_VAULT, abi: VAULT_ABI, functionName: 'getPoolTokens', args: [address],
      }).catch(() => null)
      if (!poolResult) return null

      const [tokens, balancesRaw] = poolResult as unknown as [`0x${string}`[], bigint[], bigint[]]
      if (!tokens || tokens.length === 0) return null

      const tokenMeta = await publicClient.multicall({
        contracts: tokens.flatMap(t => ([
          { address: t, abi: ERC20_ABI, functionName: 'symbol'   as const },
          { address: t, abi: ERC20_ABI, functionName: 'decimals' as const },
        ])),
        allowFailure: true,
      })

      const symbols:   string[] = []
      const decimals:  number[] = []
      for (let i = 0; i < tokens.length; i++) {
        symbols.push(tokenMeta[i * 2].status === 'success'     ? (tokenMeta[i * 2].result as string) : 'UNKNOWN')
        decimals.push(tokenMeta[i * 2 + 1].status === 'success' ? Number(tokenMeta[i * 2 + 1].result as number) : 18)
      }

      const balances = (balancesRaw as bigint[]).map((b, i) => Number(b) / 10 ** decimals[i])

      let tvlUSD = 0
      for (let i = 0; i < symbols.length; i++) {
        if (STABLE_SYMBOLS.has(symbols[i])) tvlUSD += balances[i]
        else if (WMON_SYMBOLS.has(symbols[i])) tvlUSD += balances[i] * monPrice.bestPrice
      }

      return { address, type, tokens: symbols, balances, tvlUSD, protocol: 'balancer' as const }
    }),
  )

  return results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => (r as PromiseFulfilledResult<BalancerPool>).value)
    .sort((a, b) => b.tvlUSD - a.tvlUSD)
}

/**
 * Returns total USD value locked across all Balancer pools on Monad.
 *
 * Aggregates `tvlUSD` from every pool returned by {@link getBalancerPools}.
 *
 * @returns Total TVL in USD as a plain number
 *
 * @example
 * ```typescript
 * const tvl = await getBalancerTVL()
 * // → 487500
 * ```
 *
 * @category DEX
 */
export async function getBalancerTVL(): Promise<number> {
  const pools = await getBalancerPools()
  return pools.reduce((s, p) => s + p.tvlUSD, 0)
}
