/**
 * @module Swaap
 * @description Swaap Finance safeguard AMM pools on Monad.
 * Uses a Balancer-style vault architecture with oracle-backed proactive pricing
 * to protect liquidity providers from impermanent loss. Pools are discovered
 * via factory event scanning.
 *
 * **TVL:** ~$1M
 * **Type:** Safeguard AMM (Balancer-style)
 * **Docs:** https://swaap.finance
 *
 * Available functions:
 * - {@link getSwaapPools} — all Swaap safeguard pools with token balances and TVL
 * - {@link getSwaapTVL} — total USD in all Swaap pools
 */

// ============================================================
// Rampart SDK — Swaap Finance on Monad
// Market-maker DEX using proactive oracle-based pricing (Safeguard AMM).
// Source: github.com/monad-crypto/protocols/mainnet/swaap.jsonc
// ============================================================

import { publicClient } from '../chain'
import { getToken } from './dex/tokens'

export const SWAAP_ADDRESSES = {
  Vault:            '0xd315a9c38ec871068fec378e4ce78af528c76293' as `0x${string}`,
  SafeguardFactory: '0xCc74BD5d8D2d333D14475e022325555ebA3369B8' as `0x${string}`,
} as const

// Swaap uses a Balancer-style vault — pools are registered by poolId
const SWAAP_VAULT_ABI = [
  {
    name: 'getPool',
    type: 'function' as const,
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [{ type: 'address' }, { type: 'uint8' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'getPoolTokens',
    type: 'function' as const,
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [
      { name: 'tokens',   type: 'address[]' },
      { name: 'balances', type: 'uint256[]' },
      { name: 'lastChangeBlock', type: 'uint256' },
    ],
    stateMutability: 'view' as const,
  },
] as const

const FACTORY_ABI = [
  {
    name: 'SafeguardPoolCreated',
    type: 'event' as const,
    inputs: [
      { name: 'pool',   type: 'address', indexed: true  },
      { name: 'poolId', type: 'bytes32', indexed: false },
    ],
  },
  { name: 'getNumberOfPools', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
] as const

const ERC20_ABI = [
  { name: 'symbol',   type: 'function' as const, inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' as const },
  { name: 'decimals', type: 'function' as const, inputs: [], outputs: [{ type: 'uint8' }],  stateMutability: 'view' as const },
] as const

const POOL_ABI = [
  { name: 'getPoolId',  type: 'function' as const, inputs: [], outputs: [{ type: 'bytes32' }], stateMutability: 'view' as const },
  { name: 'totalSupply', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
] as const

export interface SwaapPool {
  poolId:    string
  address:   string
  tokens:    string[]
  balances:  number[]
  tvlUSD:    number
  protocol:  'swaap'
}

/**
 * Returns all Swaap Finance safeguard pools on Monad with token balances and TVL.
 *
 * Discovers pools by scanning `SafeguardPoolCreated` events from the factory,
 * then queries the Balancer-style vault for each pool's token addresses and balances.
 * TVL is estimated from stablecoin balances in the pool.
 *
 * @returns Array of {@link SwaapPool} objects with poolId, token symbols, balances, and tvlUSD
 *
 * @example
 * ```typescript
 * const pools = await getSwaapPools()
 * // → [{ tokens: ['WMON', 'USDC'], balances: [28000, 9900], tvlUSD: 9900, ... }, ...]
 * ```
 *
 * @category DEX
 */
export async function getSwaapPools(): Promise<SwaapPool[]> {
  const blockNow = await publicClient.getBlockNumber().catch(() => 0n)
  const fromBlock = blockNow > 100_000n ? blockNow - 100_000n : 0n

  // Scan for SafeguardPoolCreated events
  const logs = await publicClient.getLogs({
    address: SWAAP_ADDRESSES.SafeguardFactory,
    event: FACTORY_ABI[0],
    fromBlock,
    toBlock: blockNow,
  }).catch(() => [])

  if (logs.length === 0) return []

  const results = await Promise.allSettled(
    logs.map(async (log) => {
      const poolAddr = log.args.pool as `0x${string}`
      const poolIdArg = log.args.poolId as `0x${string}`

      // Get pool tokens and balances from the vault
      const poolTokensResult = await publicClient.readContract({
        address: SWAAP_ADDRESSES.Vault,
        abi: SWAAP_VAULT_ABI,
        functionName: 'getPoolTokens',
        args: [poolIdArg],
      }).catch(() => null)

      if (!poolTokensResult) return null

      const { tokens, balances } = poolTokensResult as unknown as { tokens: string[]; balances: bigint[] }

      // Resolve token symbols and decimals
      const tokenInfos = await Promise.allSettled(
        tokens.map(async (t) => {
          const [sym, dec] = await Promise.allSettled([
            publicClient.readContract({ address: t as `0x${string}`, abi: ERC20_ABI, functionName: 'symbol' }),
            publicClient.readContract({ address: t as `0x${string}`, abi: ERC20_ABI, functionName: 'decimals' }),
          ])
          return {
            symbol:   sym.status   === 'fulfilled' ? (sym.value as string) : t.slice(0, 8),
            decimals: dec.status   === 'fulfilled' ? Number(dec.value as number) : 18,
          }
        })
      )

      const tokenSymbols  = tokenInfos.map(r => r.status === 'fulfilled' ? r.value.symbol : '?')
      const tokenDecimals = tokenInfos.map(r => r.status === 'fulfilled' ? r.value.decimals : 18)
      const humanBalances = (balances as bigint[]).map((b, i) => Number(b) / (10 ** tokenDecimals[i]))

      // Rough TVL: sum of stablecoin balances
      const tvlUSD = humanBalances.reduce((sum, bal, i) => {
        const sym = tokenSymbols[i].toUpperCase()
        const isStable = ['USDC', 'AUSD', 'USDT', 'USDT0', 'MUSD'].some(s => sym.includes(s))
        return sum + (isStable ? bal : 0)
      }, 0)

      return {
        poolId:   poolIdArg,
        address:  poolAddr,
        tokens:   tokenSymbols,
        balances: humanBalances,
        tvlUSD,
        protocol: 'swaap' as const,
      } satisfies SwaapPool
    })
  )

  return results.flatMap(r => r.status === 'fulfilled' && r.value !== null ? [r.value as SwaapPool] : [])
}

/**
 * Returns total Swaap Finance TVL on Monad in USD.
 *
 * Sums the stablecoin-estimated TVL across all discovered safeguard pools.
 *
 * @returns Total TVL in USD across all Swaap pools
 *
 * @example
 * ```typescript
 * const tvl = await getSwaapTVL()
 * // → 980000
 * ```
 *
 * @category DEX
 */
export async function getSwaapTVL(): Promise<number> {
  const pools = await getSwaapPools()
  return pools.reduce((s, p) => s + p.tvlUSD, 0)
}
