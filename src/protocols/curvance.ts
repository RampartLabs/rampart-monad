/**
 * @module Curvance
 * @description Curvance omnichain lending protocol on Monad Mainnet.
 * Implements Compound V2-style cToken markets backed by ERC4626 vaults.
 * Twelve markets are deployed covering MON LSTs, USDC, WBTC, WETH, and
 * yield-bearing stablecoins.
 *
 * **TVL:** ~$33M
 * **Type:** Lending (Compound V2 fork)
 * **Docs:** https://docs.curvance.com
 *
 * Available functions:
 * - {@link getCurvanceMarkets} — all cToken markets with supply/borrow APY
 * - {@link getCurvanceTVL} — total USD supplied across all Curvance markets
 * - {@link getCurvanceMarket} — single market by cToken symbol
 */

// ============================================================
// Rampart SDK — Curvance Lending Protocol on Monad (Phase 3.3)
// Curvance is an omnichain DeFi platform with cToken markets.
// $58.9M TVL across 12 cToken markets (largest new protocol addition).
// Verified from monad-crypto/protocols/mainnet/curvance.jsonc
// ============================================================

import { publicClient } from '../chain'
import { getVerifiedPrice } from './oracles'

const CENTRAL_REGISTRY: `0x${string}` = '0x1310f352f1389969Ece6741671c4B919523912fF'
const PROTOCOL_VIEWER:  `0x${string}` = '0xeD12668728c95DDa3411f29d5347356E6da222dA'

const SECONDS_PER_YEAR = 365.25 * 24 * 3600

// Verified cToken market addresses from monad-crypto/protocols/mainnet/curvance.jsonc
const CTOKEN_MARKETS: Record<string, `0x${string}`> = {
  caprMON: '0xD9E2025b907E95EcC963A5018f56B87575B4aB26',
  cWMON:   '0x1e240E30E51491546deC3aF16B0b4EAC8Dd110D4',
  cshMON:  '0x926C101Cf0a3dE8725Eb24a93E980f9FE34d6230',
  csMON:   '0x494876051B0E85dCe5ecd5822B1aD39b9660c928',
  cUSDC:   '0x21aDBb60a5fB909e7F1fB48aACC4569615CD97b5',
  cWBTC:   '0x3D2Ff9F862D89Ba526a0fC166bD56ABe04EF28d5',
  cWETH:   '0x8Af00fbbb2601A8F7636EabbF6243B30BEA47D50',
  cAUSD:   '0x6E182EB501800C555bd5E662E6D350D627F504D8',
  cmuBOND: '0x92EE4b4d33Dc61bd93a88601F29131B08aCedBF1',
  cezETH:  '0x20f1A13BfbF85a22Aa59D189861790981372220b',
  cearnAUSD: '0x852FF1EC21D63b405eC431e04AE3AC760e29263D',
  csAUSD:  '0xAd4AA2a713fB86FBb6b60dE2aF9E32a11DB6Abf2',
}

// Fallback USD prices for tokens without on-chain oracle feed.
// These are checked only after getVerifiedPrice() fails.
// AUSD, muBOND, earnAUSD are yield-bearing stablecoins pegged ~$1.
const PRICE_FALLBACKS: Record<string, number> = {
  AUSD:     1.0,
  BOND:     1.0,
  earnAUSD: 1.0,
  sAUSD:    1.0,
}

// ─── ABIs ────────────────────────────────────────────────────────────────────

const CTOKEN_ABI = [
  {
    name: 'totalAssets',
    type: 'function' as const,
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'totalBorrows',
    type: 'function' as const,
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'asset',
    type: 'function' as const,
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'totalSupply',
    type: 'function' as const,
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'convertToAssets',
    type: 'function' as const,
    inputs: [{ name: 'shares', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'interestRateModel',
    type: 'function' as const,
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view' as const,
  },
] as const

const ERC20_ABI = [
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
] as const

const IRM_ABI = [
  {
    name: 'supplyRate',
    type: 'function' as const,
    inputs: [
      { name: 'assetsHeld', type: 'uint256' },
      { name: 'debt',       type: 'uint256' },
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'borrowRate',
    type: 'function' as const,
    inputs: [
      { name: 'assetsHeld', type: 'uint256' },
      { name: 'debt',       type: 'uint256' },
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view' as const,
  },
] as const

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CurvanceMarket {
  cToken:       string
  cTokenAddr:   string
  asset:        string
  assetAddr:    string
  decimals:     number
  totalAssets:  number
  totalBorrows: number
  totalAssetsUSD: number
  supplyAPY:    number
  borrowAPR:    number
  utilization:  number
  exchangeRate: number
  protocol:     'curvance'
}

// ─── Functions ───────────────────────────────────────────────────────────────

/**
 * Fetch all Curvance cToken markets with TVL, utilization, and APY data.
 *
 * For each market: reads `totalAssets`, `totalBorrows`, `convertToAssets`,
 * and `interestRateModel`. Calls `supplyRate(assetsHeld, debt)` and
 * `borrowRate(assetsHeld, debt)` on the IRM to derive real APY values.
 * Price is resolved via {@link getVerifiedPrice} first, then PRICE_FALLBACKS.
 *
 * @returns Array of market snapshots sorted by `totalAssetsUSD` descending
 *
 * @category Lending
 */
export async function getCurvanceMarkets(): Promise<CurvanceMarket[]> {
  const markets: CurvanceMarket[] = []

  await Promise.allSettled(
    Object.entries(CTOKEN_MARKETS).map(async ([cSymbol, cAddr]) => {
      try {
        const [totalAssets, assetAddr, totalSupply] = await Promise.all([
          publicClient.readContract({ address: cAddr, abi: CTOKEN_ABI, functionName: 'totalAssets' }),
          publicClient.readContract({ address: cAddr, abi: CTOKEN_ABI, functionName: 'asset' }),
          publicClient.readContract({ address: cAddr, abi: CTOKEN_ABI, functionName: 'totalSupply' }),
        ])

        const [sym, dec] = await Promise.all([
          publicClient.readContract({ address: assetAddr as `0x${string}`, abi: ERC20_ABI, functionName: 'symbol' }),
          publicClient.readContract({ address: assetAddr as `0x${string}`, abi: ERC20_ABI, functionName: 'decimals' }),
        ])

        const decimals    = Number(dec)
        const assetsHuman = Number(totalAssets) / 10 ** decimals

        let borrowsHuman = 0
        let borrowsRaw   = BigInt(0)
        try {
          const borrows = await publicClient.readContract({ address: cAddr, abi: CTOKEN_ABI, functionName: 'totalBorrows' })
          borrowsRaw    = borrows as bigint
          borrowsHuman  = Number(borrowsRaw) / 10 ** decimals
        } catch { /* totalBorrows not active */ }

        let exchangeRate = 1
        try {
          const oneShare = BigInt(10 ** Math.min(decimals, 18))
          const assets   = await publicClient.readContract({
            address: cAddr, abi: CTOKEN_ABI, functionName: 'convertToAssets', args: [oneShare],
          })
          exchangeRate = Number(assets as bigint) / Number(oneShare)
        } catch { /* 1:1 fallback */ }

        let supplyAPY = 0
        let borrowAPR = 0
        try {
          const irmAddr = await publicClient.readContract({ address: cAddr, abi: CTOKEN_ABI, functionName: 'interestRateModel' })
          if (irmAddr && irmAddr !== '0x0000000000000000000000000000000000000000') {
            const irm = irmAddr as `0x${string}`
            const [supplyRateRaw, borrowRateRaw] = await Promise.all([
              publicClient.readContract({
                address: irm, abi: IRM_ABI, functionName: 'supplyRate',
                args: [totalAssets as bigint, borrowsRaw],
              }),
              publicClient.readContract({
                address: irm, abi: IRM_ABI, functionName: 'borrowRate',
                args: [totalAssets as bigint, borrowsRaw],
              }),
            ])
            const supplyRatePerSec = Number(supplyRateRaw as bigint) / 1e18
            const borrowRatePerSec = Number(borrowRateRaw as bigint) / 1e18
            supplyAPY = Math.pow(1 + supplyRatePerSec, SECONDS_PER_YEAR) - 1
            borrowAPR = Math.pow(1 + borrowRatePerSec, SECONDS_PER_YEAR) - 1
          }
        } catch { /* IRM not active or different interface */ }

        const symStr = sym as string

        let usdPrice = 0
        try {
          const vp = await getVerifiedPrice(symStr)
          usdPrice  = vp.bestPrice
        } catch { /* no oracle feed */ }

        if (!usdPrice) {
          usdPrice = PRICE_FALLBACKS[symStr] ?? 0
        }

        const utilization    = assetsHuman > 0 ? borrowsHuman / assetsHuman : 0
        const totalAssetsUSD = assetsHuman * usdPrice

        markets.push({
          cToken:       cSymbol,
          cTokenAddr:   cAddr,
          asset:        symStr,
          assetAddr:    assetAddr as string,
          decimals,
          totalAssets:  assetsHuman,
          totalBorrows: borrowsHuman,
          totalAssetsUSD,
          supplyAPY,
          borrowAPR,
          utilization,
          exchangeRate,
          protocol:     'curvance',
        })
      } catch { /* skip if contract call fails */ }
    })
  )

  return markets.sort((a, b) => b.totalAssetsUSD - a.totalAssetsUSD)
}

/**
 * Return the total USD TVL across all Curvance cToken markets.
 *
 * @returns Sum of USD TVL across all 12 cToken markets
 *
 * @category Lending
 */
export async function getCurvanceTVL(): Promise<number> {
  const markets = await getCurvanceMarkets()
  return markets.reduce((sum, m) => sum + m.totalAssetsUSD, 0)
}

/**
 * Look up a single Curvance cToken market by its cToken symbol.
 *
 * Symbol matching is case-insensitive (e.g. `'cwmon'` matches `'cWMON'`).
 *
 * @param cSymbol - cToken symbol to look up (e.g. `'cWMON'`, `'cUSDC'`)
 * @returns Market snapshot, or `null` if the symbol is not found
 *
 * @category Lending
 */
export async function getCurvanceMarket(cSymbol: string): Promise<CurvanceMarket | null> {
  const markets = await getCurvanceMarkets()
  return markets.find(m => m.cToken.toLowerCase() === cSymbol.toLowerCase()) ?? null
}

/**
 * Deployed Curvance contract addresses on Monad Mainnet.
 *
 * @category Lending
 */
export const CURVANCE_ADDRESSES = {
  centralRegistry: CENTRAL_REGISTRY,
  protocolViewer:  PROTOCOL_VIEWER,
  cTokens:         CTOKEN_MARKETS,
} as const
