/**
 * @module TownSquare
 * @description TownSquare — cross-chain spoke/hub lending protocol on Monad.
 * Monad acts as a spoke chain that connects to a hub for unified cross-chain
 * liquidity. Each asset pool (IAssetHubPool) tracks deposits, borrows, and
 * interest rates independently.
 *
 * **TVL:** ~$2M
 * **Type:** Cross-Chain Lending
 * **Docs:** https://docs.townsq.xyz
 *
 * Available functions:
 * - {@link getTownSquareMarkets} — lending market stats (deposits, borrows, APY)
 * - {@link getTownSquareTVL} — aggregate deposit TVL in USD
 */

// ============================================================
// Rampart SDK — TownSquare on Monad
// Cross-chain spoke/hub lending with IAssetHubPool per asset.
// Hub: 0x2dfdb4bf6c910b5bbbb0d07ec5f088e294628189
// Each pool exposes getDepositData() and getVariableBorrowData()
// for live borrow/deposit totals and per-second interest rates.
// Source: github.com/townesquare/TownSqVault (IAssetHubPool interface)
// ============================================================

import { publicClient } from '../chain'
import { getVerifiedPrice } from './oracles'

export const TOWNSQUARE_ADDRESSES = {
  Hub: '0x2dfdb4bf6c910b5bbbb0d07ec5f088e294628189' as `0x${string}`,
} as const

const SECONDS_PER_YEAR = 365.25 * 24 * 3600

// IAssetHubPool ABIs — derived from townesquare/TownSqVault IAssetHubPool.sol
// getDepositData returns: { optimalUtilisationRatio, totalAmount, interestRate (18 dec), interestIndex (18 dec) }
// getVariableBorrowData returns: { vr0, vr1, vr2, totalAmount, interestRate (18 dec), interestIndex (18 dec) }
const POOL_ABI = [
  {
    name: 'totalSupply',
    type: 'function' as const,
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'name',
    type: 'function' as const,
    inputs: [],
    outputs: [{ type: 'string' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'symbol',
    type: 'function' as const,
    inputs: [],
    outputs: [{ type: 'string' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'decimals',
    type: 'function' as const,
    inputs: [],
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'getDepositData',
    type: 'function' as const,
    inputs: [],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'optimalUtilisationRatio', type: 'uint16'  },
          { name: 'totalAmount',             type: 'uint256' },
          { name: 'interestRate',            type: 'uint256' },
          { name: 'interestIndex',           type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view' as const,
  },
  {
    name: 'getVariableBorrowData',
    type: 'function' as const,
    inputs: [],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'vr0',           type: 'uint32'  },
          { name: 'vr1',           type: 'uint32'  },
          { name: 'vr2',           type: 'uint32'  },
          { name: 'totalAmount',   type: 'uint256' },
          { name: 'interestRate',  type: 'uint256' },
          { name: 'interestIndex', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view' as const,
  },
] as const

export interface TownSquareMarket {
  address:       string
  asset:         string
  poolSymbol:    string
  poolName:      string
  totalDeposits: number
  totalBorrows:  number
  supplyAPY:     number
  borrowAPY:     number
  tvlUSD:        number
  protocol:      'townsquare'
}

// Asset pool contracts on Monad Mainnet.
// Each entry is an IAssetHubPool contract for the given underlying asset.
// Additional pools (USDT, USD1, AUSD, sAUSD, earnAUSD, WETH, WBTC, shMON,
// gMON, sMON, aprMON, muBOND, AZND, loAZND) will be added once their
// IAssetHubPool addresses are confirmed on-chain.
const POOL_CONFIG: ReadonlyArray<{ addr: `0x${string}`; symbol: string; decimals: number }> = [
  { addr: '0x106d0e2bff74b39d09636bdcd5d4189f24d91433', symbol: 'MON',  decimals: 18 },
  { addr: '0xdb4e67f878289a820046f46f6304fd6ee1449281', symbol: 'USDC', decimals: 6  },
]

/**
 * Returns TownSquare cross-chain lending market stats on Monad.
 *
 * Reads `getDepositData()` and `getVariableBorrowData()` from each
 * IAssetHubPool contract to get real borrow and deposit totals.
 * Interest rates (per-second, 18 decimals) are compounded to APY.
 * Asset prices are resolved via {@link getVerifiedPrice}.
 *
 * @returns Array of {@link TownSquareMarket} for active pools.
 *
 * @category Lending
 */
export async function getTownSquareMarkets(): Promise<TownSquareMarket[]> {
  const results = await Promise.allSettled(
    POOL_CONFIG.map(async (pool) => {
      const [nameResult, symbolResult, depositResult, borrowResult] = await Promise.allSettled([
        publicClient.readContract({ address: pool.addr, abi: POOL_ABI, functionName: 'name' }),
        publicClient.readContract({ address: pool.addr, abi: POOL_ABI, functionName: 'symbol' }),
        publicClient.readContract({ address: pool.addr, abi: POOL_ABI, functionName: 'getDepositData' }),
        publicClient.readContract({ address: pool.addr, abi: POOL_ABI, functionName: 'getVariableBorrowData' }),
      ])

      const divisor = BigInt(10 ** pool.decimals)

      let totalDeposits = 0
      let supplyAPY     = 0
      if (depositResult.status === 'fulfilled') {
        const dd = depositResult.value as {
          optimalUtilisationRatio: number
          totalAmount: bigint
          interestRate: bigint
          interestIndex: bigint
        }
        totalDeposits = Number(dd.totalAmount / divisor) + Number(dd.totalAmount % divisor) / 10 ** pool.decimals
        const ratePerSec = Number(dd.interestRate) / 1e18
        supplyAPY = Math.pow(1 + ratePerSec, SECONDS_PER_YEAR) - 1
      }

      let totalBorrows = 0
      let borrowAPY    = 0
      if (borrowResult.status === 'fulfilled') {
        const bd = borrowResult.value as {
          vr0: number
          vr1: number
          vr2: number
          totalAmount: bigint
          interestRate: bigint
          interestIndex: bigint
        }
        totalBorrows = Number(bd.totalAmount / divisor) + Number(bd.totalAmount % divisor) / 10 ** pool.decimals
        const ratePerSec = Number(bd.interestRate) / 1e18
        borrowAPY = Math.pow(1 + ratePerSec, SECONDS_PER_YEAR) - 1
      }

      if (totalDeposits === 0) return null

      const poolName   = nameResult.status   === 'fulfilled' ? String(nameResult.value)   : ''
      const poolSymbol = symbolResult.status === 'fulfilled' ? String(symbolResult.value) : ''

      let priceUSD = 0
      try {
        const vp = await getVerifiedPrice(pool.symbol)
        priceUSD  = vp.bestPrice
      } catch { /* price unavailable */ }

      return {
        address:       pool.addr,
        asset:         pool.symbol,
        poolSymbol,
        poolName,
        totalDeposits,
        totalBorrows,
        supplyAPY,
        borrowAPY,
        tvlUSD:   totalDeposits * priceUSD,
        protocol: 'townsquare' as const,
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
 * @returns Total TVL as a float (USD).
 *
 * @category Lending
 */
export async function getTownSquareTVL(): Promise<number> {
  const markets = await getTownSquareMarkets()
  return markets.reduce((s, m) => s + m.tvlUSD, 0)
}
