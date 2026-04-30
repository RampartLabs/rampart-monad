/**
 * @module Curve
 * @description Curve Finance stable AMM pool aggregator for Monad mainnet.
 * Discovers pools via the Curve MetaRegistry, fetches coin balances and fees,
 * and estimates TVL using stablecoin peg and Redstone MON price.
 *
 * **TVL:** ~$2M
 * **Type:** Stable AMM
 * **Docs:** https://curve.fi
 *
 * Available functions:
 * - {@link getCurvePools} — all Curve stable swap pools on Monad sorted by TVL
 * - {@link getCurveTVL} — total USD locked across all Curve pools
 * - {@link getCurvePoolByCoins} — find a pool by token pair symbols
 */

import { publicClient } from '../chain'
import { getVerifiedPrice } from './oracles'

const META_REGISTRY: `0x${string}` = '0xe6dA14500f0b5783E2325F9C5a7eE5d99DA0fB42'
const CURVE_ROUTER:  `0x${string}` = '0xFF5Cb29241F002fFeD2eAa224e3e996D24A6E8d1'

const STABLE_SYMBOLS = new Set(['USDC', 'USDT', 'USDT0', 'AUSD', 'DAI'])
const WMON_SYMBOLS   = new Set(['WMON', 'MON'])

const META_REGISTRY_ABI = [
  { name: 'pool_count',    type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'pool_list',     type: 'function' as const, inputs: [{ type: 'uint256', name: 'i' }], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
  { name: 'get_pool_name', type: 'function' as const, inputs: [{ type: 'address', name: 'pool' }], outputs: [{ type: 'string' }], stateMutability: 'view' as const },
  { name: 'get_pool_coins', type: 'function' as const, inputs: [{ type: 'address', name: 'pool' }], outputs: [{ type: 'address[8]' }], stateMutability: 'view' as const },
  { name: 'get_balances',  type: 'function' as const, inputs: [{ type: 'address', name: 'pool' }], outputs: [{ type: 'uint256[8]' }], stateMutability: 'view' as const },
  { name: 'get_fees',      type: 'function' as const, inputs: [{ type: 'address', name: 'pool' }], outputs: [{ type: 'uint256[10]' }], stateMutability: 'view' as const },
  { name: 'get_n_coins',   type: 'function' as const, inputs: [{ type: 'address', name: 'pool' }], outputs: [{ type: 'uint256[2]' }], stateMutability: 'view' as const },
  { name: 'get_A',         type: 'function' as const, inputs: [{ type: 'address', name: 'pool' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
] as const

const CURVE_POOL_ABI = [
  { name: 'admin_fee',        type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'get_virtual_price', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
] as const

const ERC20_ABI = [
  { name: 'symbol',   type: 'function' as const, inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' as const },
  { name: 'decimals', type: 'function' as const, inputs: [], outputs: [{ type: 'uint8'  }], stateMutability: 'view' as const },
] as const

export interface CurvePool {
  address:       string
  name:          string
  coins:         string[]
  coinDecimals:  number[]
  balances:      number[]
  fee:           number
  adminFee:      number   // protocol fee as fraction of swap fee (0..1)
  amplification: number   // A coefficient — liquidity concentration (stable pools)
  virtualPrice:  number   // pool share price in USD (health indicator, ~1 for healthy)
  tvlUSD:        number
  protocol:      'curve'
}

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'

async function estimateTvl(coins: string[], balances: number[], coinDecimals: number[], monPrice: number | null): Promise<number> {
  let tvl = 0
  for (let i = 0; i < coins.length; i++) {
    if (coins[i] === ZERO_ADDR) break
    const bal = balances[i]
    if (STABLE_SYMBOLS.has(coins[i])) tvl += bal
    else if (WMON_SYMBOLS.has(coins[i]) && monPrice !== null) tvl += bal * monPrice
  }
  return tvl
}

/**
 * Returns all active Curve pools registered on Monad via the MetaRegistry, sorted by TVL descending.
 *
 * @param maxPools - Maximum number of pools to fetch from the registry (default 50)
 * @returns Array of CurvePool with coin symbols, balances, fee, and estimated TVL in USD
 *
 * @example
 * ```typescript
 * const pools = await getCurvePools(10)
 * // → [{ name: 'USDC/USDT', coins: ['USDC', 'USDT'], tvlUSD: 1200000, fee: 0.0001 }]
 * ```
 *
 * @category DEX
 */
export async function getCurvePools(maxPools = 50): Promise<CurvePool[]> {
  const countRaw = await publicClient.readContract({
    address: META_REGISTRY, abi: META_REGISTRY_ABI, functionName: 'pool_count',
  }).catch(() => 0n)

  const count = Math.min(Number(countRaw as bigint), maxPools)
  if (count === 0) return []

  const poolAddresses = await publicClient.multicall({
    contracts: Array.from({ length: count }, (_, i) => ({
      address: META_REGISTRY, abi: META_REGISTRY_ABI, functionName: 'pool_list' as const,
      args: [BigInt(i)] as const,
    })),
    allowFailure: true,
  })

  const pools = poolAddresses
    .filter(r => r.status === 'success')
    .map(r => r.result as `0x${string}`)

  const monPriceRaw = await getVerifiedPrice('MON').catch(() => null)
  const monPrice = monPriceRaw?.bestPrice ?? null

  const results = await Promise.allSettled(
    pools.map(async (pool) => {
      const [name, coinsRaw, balancesRaw, feesRaw, nCoinsRaw] = await Promise.all([
        publicClient.readContract({ address: META_REGISTRY, abi: META_REGISTRY_ABI, functionName: 'get_pool_name', args: [pool] }),
        publicClient.readContract({ address: META_REGISTRY, abi: META_REGISTRY_ABI, functionName: 'get_pool_coins', args: [pool] }),
        publicClient.readContract({ address: META_REGISTRY, abi: META_REGISTRY_ABI, functionName: 'get_balances',  args: [pool] }),
        publicClient.readContract({ address: META_REGISTRY, abi: META_REGISTRY_ABI, functionName: 'get_fees',      args: [pool] }),
        publicClient.readContract({ address: META_REGISTRY, abi: META_REGISTRY_ABI, functionName: 'get_n_coins',   args: [pool] }),
      ])

      const nCoins = Number((nCoinsRaw as unknown as bigint[])[0])
      const coinAddrs = (coinsRaw as unknown as string[]).slice(0, nCoins).filter(a => a !== ZERO_ADDR)

      const tokenMeta = await publicClient.multicall({
        contracts: coinAddrs.flatMap(addr => ([
          { address: addr as `0x${string}`, abi: ERC20_ABI, functionName: 'symbol'   as const },
          { address: addr as `0x${string}`, abi: ERC20_ABI, functionName: 'decimals' as const },
        ])),
        allowFailure: true,
      })

      const coins:        string[] = []
      const coinDecimals: number[] = []
      for (let i = 0; i < coinAddrs.length; i++) {
        const sym = tokenMeta[i * 2].status === 'success'     ? (tokenMeta[i * 2].result as string) : 'UNKNOWN'
        const dec = tokenMeta[i * 2 + 1].status === 'success' ? Number(tokenMeta[i * 2 + 1].result as number) : 18
        coins.push(sym)
        coinDecimals.push(dec)
      }

      const balances = (balancesRaw as unknown as bigint[]).slice(0, nCoins).map(
        (b, i) => Number(b) / 10 ** (coinDecimals[i] ?? 18)
      )
      const fee    = Number((feesRaw as unknown as bigint[])[0]) / 1e10
      const tvlUSD = await estimateTvl(coins, balances, coinDecimals, monPrice)

      const [amplificationRaw, adminFeeRaw, virtualPriceRaw] = await Promise.all([
        publicClient.readContract({ address: META_REGISTRY, abi: META_REGISTRY_ABI, functionName: 'get_A', args: [pool] }).catch(() => null),
        publicClient.readContract({ address: pool, abi: CURVE_POOL_ABI, functionName: 'admin_fee' }).catch(() => null),
        publicClient.readContract({ address: pool, abi: CURVE_POOL_ABI, functionName: 'get_virtual_price' }).catch(() => null),
      ])

      return {
        address: pool, name: name as string, coins, coinDecimals, balances, fee, tvlUSD,
        amplification: amplificationRaw !== null ? Number(amplificationRaw as bigint) : 0,
        adminFee:      adminFeeRaw      !== null ? Number(adminFeeRaw      as bigint) / 1e10 : 0,
        virtualPrice:  virtualPriceRaw  !== null ? Number(virtualPriceRaw  as bigint) / 1e18 : 0,
        protocol: 'curve' as const,
      }
    }),
  )

  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as PromiseFulfilledResult<CurvePool>).value)
    .sort((a, b) => b.tvlUSD - a.tvlUSD)
}

/**
 * Returns total USD value locked across all Curve pools on Monad.
 *
 * @returns Sum of tvlUSD across all registered Curve pools
 *
 * @example
 * ```typescript
 * const tvl = await getCurveTVL()
 * // → 1950000
 * ```
 *
 * @category DEX
 */
export async function getCurveTVL(): Promise<number> {
  const pools = await getCurvePools()
  return pools.reduce((s, p) => s + p.tvlUSD, 0)
}

/**
 * Finds a Curve pool that contains both specified token symbols.
 * Symbol matching is case-insensitive.
 *
 * @param coin0 - Symbol of the first token (e.g. "WMON")
 * @param coin1 - Symbol of the second token (e.g. "USDC")
 * @returns The first matching CurvePool, or null if no pool contains both tokens
 *
 * @example
 * ```typescript
 * const pool = await getCurvePoolByCoins('WMON', 'USDC')
 * // → { name: 'WMON/USDC', tvlUSD: 500000, fee: 0.0004, ... } or null
 * ```
 *
 * @category DEX
 */
export async function getCurvePoolByCoins(coin0: string, coin1: string): Promise<CurvePool | null> {
  const pools = await getCurvePools()
  const u0 = coin0.toUpperCase(), u1 = coin1.toUpperCase()
  return pools.find(p =>
    p.coins.map(c => c.toUpperCase()).includes(u0) &&
    p.coins.map(c => c.toUpperCase()).includes(u1)
  ) ?? null
}

export { CURVE_ROUTER }
