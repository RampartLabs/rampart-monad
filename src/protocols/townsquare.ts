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

export const TOWNSQUARE_ADDRESSES = {
  SpokeController: '0x8f8a0ed366439576b7db220678ed1259743239e3' as `0x${string}`,
  AccountCtrl:     '0xc2df24203ab3a4f3857d649757a99e18de059a16' as `0x${string}`,
} as const

const SPOKE_CTRL_ABI = [
  { name: 'totalDeposits',  type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'totalBorrows',   type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'supplyRate',     type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'borrowRate',     type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'asset',          type: 'function' as const, inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
] as const

const ERC20_ABI = [
  { name: 'symbol',   type: 'function' as const, inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' as const },
  { name: 'decimals', type: 'function' as const, inputs: [], outputs: [{ type: 'uint8' }],  stateMutability: 'view' as const },
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

const BLOCKS_PER_YEAR = 2_160_000

/**
 * Returns TownSquare cross-chain lending market stats on Monad.
 *
 * Reads `totalDeposits`, `totalBorrows`, `supplyRate`, `borrowRate`, and `asset`
 * from the SpokeController, then resolves the asset's symbol and decimals.
 * Interest rates are expected as per-block values in ray (1e27) or mantissa (1e18);
 * both are annualised using 2,160,000 blocks per year (~400ms block time).
 * Returns an empty array if `totalDeposits` is zero (protocol not yet active).
 *
 * @returns Array of {@link TownSquareMarket} (zero or one entry for the spoke market).
 *
 * @example
 * ```typescript
 * const markets = await getTownSquareMarkets()
 * // → [{ asset: 'USDC', totalDeposits: 2000000, totalBorrows: 1500000, supplyAPY: 0.05, ... }]
 * ```
 *
 * @category Lending
 */
export async function getTownSquareMarkets(): Promise<TownSquareMarket[]> {
  const [depositsRaw, borrowsRaw, supplyRateRaw, borrowRateRaw, assetAddrRaw] = await Promise.allSettled([
    publicClient.readContract({ address: TOWNSQUARE_ADDRESSES.SpokeController, abi: SPOKE_CTRL_ABI, functionName: 'totalDeposits' }),
    publicClient.readContract({ address: TOWNSQUARE_ADDRESSES.SpokeController, abi: SPOKE_CTRL_ABI, functionName: 'totalBorrows' }),
    publicClient.readContract({ address: TOWNSQUARE_ADDRESSES.SpokeController, abi: SPOKE_CTRL_ABI, functionName: 'supplyRate' }),
    publicClient.readContract({ address: TOWNSQUARE_ADDRESSES.SpokeController, abi: SPOKE_CTRL_ABI, functionName: 'borrowRate' }),
    publicClient.readContract({ address: TOWNSQUARE_ADDRESSES.SpokeController, abi: SPOKE_CTRL_ABI, functionName: 'asset' }),
  ])

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

  const totalDeposits = depositsRaw.status === 'fulfilled' ? Number(depositsRaw.value as bigint) / (10 ** decimals) : 0
  const totalBorrows  = borrowsRaw.status  === 'fulfilled' ? Number(borrowsRaw.value  as bigint) / (10 ** decimals) : 0
  const supplyRate    = supplyRateRaw.status === 'fulfilled' ? Number(supplyRateRaw.value as bigint) : 0
  const borrowRate    = borrowRateRaw.status === 'fulfilled' ? Number(borrowRateRaw.value as bigint) : 0

  // Rates typically per-block in ray (1e27) or mantissa (1e18)
  const supplyAPY = supplyRate > 1e18 ? (supplyRate / 1e27) * BLOCKS_PER_YEAR : (supplyRate / 1e18) * BLOCKS_PER_YEAR
  const borrowAPY = borrowRate > 1e18 ? (borrowRate / 1e27) * BLOCKS_PER_YEAR : (borrowRate / 1e18) * BLOCKS_PER_YEAR

  if (totalDeposits === 0) return []

  return [{
    address:       TOWNSQUARE_ADDRESSES.SpokeController,
    asset:         assetSymbol,
    totalDeposits,
    totalBorrows,
    supplyAPY:     Math.max(0, supplyAPY),
    borrowAPY:     Math.max(0, borrowAPY),
    tvlUSD:        totalDeposits,
    protocol:      'townsquare',
  }]
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
