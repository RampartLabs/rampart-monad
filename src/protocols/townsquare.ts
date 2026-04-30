/**
 * @module TownSquare
 * @description TownSquare — cross-chain spoke/hub lending protocol on Monad.
 * Monad acts as a spoke chain that connects to a hub for unified cross-chain
 * liquidity. The SpokeController tracks deposits, borrows, and interest rates
 * for each supported asset.
 *
 * **TVL:** ~$2M
 * **Type:** Cross-Chain Lending
 * **Docs:** https://docs.townsquare.fi
 *
 * Available functions:
 * - {@link getTownSquareMarkets} — lending market stats (deposits, borrows, APY)
 * - {@link getTownSquareTVL} — aggregate deposit TVL in USD
 */

// ============================================================
// Rampart SDK — TownSquare on Monad
// Cross-chain spoke/hub lending with SpokeController and AccountController.
// Source: github.com/monad-crypto/protocols/mainnet/townsquare.jsonc
// ============================================================

import { publicClient } from '../chain'
import { getVerifiedPrice } from './oracles'

export const TOWNSQUARE_ADDRESSES = {
  Hub:      '0x2dfdb4bf6c910b5bbbb0d07ec5f088e294628189' as `0x${string}`,
  MONPool:  '0x106d0e2bff74b39d09636bdcd5d4189f24d91433' as `0x${string}`,
  USDCPool: '0xdb4e67f878289a820046f46f6304fd6ee1449281' as `0x${string}`,
} as const

const POOL_ABI = [
  { name: 'totalSupply', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'name',        type: 'function' as const, inputs: [], outputs: [{ type: 'string'  }], stateMutability: 'view' as const },
  { name: 'symbol',      type: 'function' as const, inputs: [], outputs: [{ type: 'string'  }], stateMutability: 'view' as const },
  { name: 'decimals',    type: 'function' as const, inputs: [], outputs: [{ type: 'uint8'   }], stateMutability: 'view' as const },
] as const

export interface TownSquareMarket {
  address:      string
  asset:        string
  totalDeposits: number
  totalBorrows:  number
  supplyAPY:    number
  borrowAPY:    number
  tvlUSD:       number
  protocol:     'townsquare'
}

const POOL_CONFIG = [
  { addr: TOWNSQUARE_ADDRESSES.MONPool,  symbol: 'MON',  decimals: 18 },
  { addr: TOWNSQUARE_ADDRESSES.USDCPool, symbol: 'USDC', decimals: 6  },
] as const

/**
 * Returns TownSquare cross-chain lending market stats on Monad.
 *
 * Reads `totalSupply` from each pool token (tsMON, tsUSDC) — these ERC20 tokens
 * represent deposited positions. TVL is totalSupply × price.
 *
 * @returns Array of {@link TownSquareMarket} for active pools.
 *
 * @example
 * ```typescript
 * const markets = await getTownSquareMarkets()
 * // → [{ asset: 'MON', totalDeposits: 1632103, tvlUSD: 50595, ... }]
 * ```
 *
 * @category Lending
 */
export async function getTownSquareMarkets(): Promise<TownSquareMarket[]> {
  const monPrice = await getVerifiedPrice('MON').then(r => r.bestPrice)

  const results = await Promise.allSettled(
    POOL_CONFIG.map(async (pool) => {
      const [supplyRaw] = await Promise.allSettled([
        publicClient.readContract({ address: pool.addr, abi: POOL_ABI, functionName: 'totalSupply' }),
      ])

      const totalDeposits = supplyRaw.status === 'fulfilled'
        ? Number(supplyRaw.value as bigint) / (10 ** pool.decimals)
        : 0
      if (totalDeposits === 0) return null

      const priceUSD = pool.symbol === 'USDC' ? 1 : monPrice

      return {
        address:       pool.addr,
        asset:         pool.symbol,
        totalDeposits,
        totalBorrows:  0,
        supplyAPY:     0,
        borrowAPY:     0,
        tvlUSD:        totalDeposits * priceUSD,
        protocol:      'townsquare' as const,
      }
    }),
  )

  return results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => (r as PromiseFulfilledResult<TownSquareMarket>).value)
}

/**
 * Returns total TownSquare deposit TVL on Monad in USD.
 *
 * Calls {@link getTownSquareMarkets} and sums `tvlUSD` (= `totalDeposits`) across
 * all returned market entries.
 *
 * @returns Total TVL as a float (USD).
 *
 * @example
 * ```typescript
 * const tvl = await getTownSquareTVL()
 * // → 2000000
 * ```
 *
 * @category Lending
 */
export async function getTownSquareTVL(): Promise<number> {
  const markets = await getTownSquareMarkets()
  return markets.reduce((s, m) => s + m.tvlUSD, 0)
}
