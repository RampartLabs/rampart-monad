/**
 * @module Sumer
 * @description Sumer Money lending markets on Monad.
 * A Compound V2 fork using sdr-tokens (supply tokens) with APY calculated
 * from per-block interest rates at ~2,160,000 blocks per year.
 *
 * **TVL:** ~$2M
 * **Type:** Lending (Compound V2 fork)
 * **Docs:** https://sumer.money
 *
 * Available functions:
 * - {@link getSumerMarkets} — all Sumer Money cToken markets with supply/borrow APY
 * - {@link getSumerTVL} — total USD supplied across all Sumer markets
 */

// ============================================================
// Rampart SDK — Sumer Money on Monad
// CDP lending protocol (Compound V2 fork) with sdr-tokens.
// Source: github.com/monad-crypto/protocols/mainnet/sumer_money.jsonc
// ============================================================

import { publicClient } from '../chain'
import { getVerifiedPrice } from './oracles'

export const SUMER_ADDRESSES = {
  Comptroller:       '0x2d9b96648C784906253c7FA94817437EF59Cf226' as `0x${string}`,
  CompLogic:         '0x332F124323A1DA3Aeca4860f3B2B4a4c0df232Ae' as `0x${string}`,
  RedemptionManager: '0xBB134359b3E6794127c7232680F959CE6BF60814' as `0x${string}`,
  Timelock:          '0x0f0af0e3dEb8A884fCB54907BA571c84C2EB3042' as `0x${string}`,
  // sdr-tokens (supply tokens, like cTokens)
  sdrMON:            '0x16C7d1F9EA48F7DE5E8bc3165A04E8340Da574fA' as `0x${string}`,
  sdrUSDC:           '0xe19FD48C972E2dB074C4B0B29Ff2f0d3E1aefe52' as `0x${string}`,
  sdrWETH:           '0xF4DB30E806609516D14cDB53D9bc306c99505451' as `0x${string}`,
} as const

// Compound V2-compatible comptroller ABI
const COMPTROLLER_ABI = [
  { name: 'getAllMarkets',                type: 'function' as const, inputs: [], outputs: [{ type: 'address[]' }], stateMutability: 'view' as const },
  { name: 'borrowCaps',                  type: 'function' as const, inputs: [{ name: 'market', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'closeFactorMantissa',         type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'liquidationIncentiveMantissa', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
] as const

// Compound V2-compatible cToken (sdr-token) ABI
const SDRTOKEN_ABI = [
  { name: 'totalSupply',         type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'totalBorrows',        type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'exchangeRateStored',  type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'supplyRatePerBlock',  type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'borrowRatePerBlock',  type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'underlying',          type: 'function' as const, inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
  { name: 'symbol',              type: 'function' as const, inputs: [], outputs: [{ type: 'string' }],  stateMutability: 'view' as const },
  { name: 'decimals',            type: 'function' as const, inputs: [], outputs: [{ type: 'uint8' }],   stateMutability: 'view' as const },
] as const

const ERC20_ABI = [
  { name: 'symbol',   type: 'function' as const, inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' as const },
  { name: 'decimals', type: 'function' as const, inputs: [], outputs: [{ type: 'uint8' }],  stateMutability: 'view' as const },
] as const

// Blocks per year on Monad (~400ms blocks = ~2_160_000 blocks/year)
const BLOCKS_PER_YEAR = 2_160_000

export interface SumerMarket {
  address:              string
  symbol:               string
  asset:                string
  totalSupply:          number   // in asset units
  totalBorrows:         number   // in asset units
  supplyAPY:            number   // annualized
  borrowAPY:            number   // annualized
  tvlUSD:               number
  borrowCap:            number   // max borrows allowed (0 = unlimited)
  closeFactor:          number   // fraction of debt that can be liquidated per call (0..1)
  liquidationIncentive: number   // bonus multiplier for liquidators (e.g. 1.08 = 8% bonus)
  protocol:             'sumer'
}

/**
 * Returns all Sumer Money lending markets on Monad with supply and borrow APY.
 *
 * Fetches sdr-token (cToken) markets from the Comptroller, then reads per-block
 * interest rates and exchange rates to compute annualised APY values.
 *
 * @returns Array of {@link SumerMarket} with totalSupply, totalBorrows, supplyAPY, borrowAPY, and tvlUSD
 *
 * @example
 * ```typescript
 * const markets = await getSumerMarkets()
 * // → [{ symbol: 'sdrUSDC', supplyAPY: 0.042, borrowAPY: 0.071, tvlUSD: 900000, ... }, ...]
 * ```
 *
 * @category Lending
 */
export async function getSumerMarkets(): Promise<SumerMarket[]> {
  // Get all markets from comptroller
  const allMarkets = await publicClient.readContract({
    address: SUMER_ADDRESSES.Comptroller,
    abi: COMPTROLLER_ABI,
    functionName: 'getAllMarkets',
  }).catch(() => null)

  const marketAddrs: `0x${string}`[] = allMarkets
    ? (allMarkets as `0x${string}`[])
    : [SUMER_ADDRESSES.sdrMON, SUMER_ADDRESSES.sdrUSDC, SUMER_ADDRESSES.sdrWETH]

  const [[monPrice, ethPrice, btcPrice], closeFactorRaw, liquidationIncentiveRaw] = await Promise.all([
    Promise.all([
      getVerifiedPrice('MON').then(r => r.bestPrice),
      getVerifiedPrice('WETH').then(r => r.bestPrice),
      getVerifiedPrice('WBTC').then(r => r.bestPrice),
    ]),
    publicClient.readContract({ address: SUMER_ADDRESSES.Comptroller, abi: COMPTROLLER_ABI, functionName: 'closeFactorMantissa' }).catch(() => null),
    publicClient.readContract({ address: SUMER_ADDRESSES.Comptroller, abi: COMPTROLLER_ABI, functionName: 'liquidationIncentiveMantissa' }).catch(() => null),
  ])

  const closeFactor          = closeFactorRaw          !== null ? Number(closeFactorRaw)          / 1e18 : 0
  const liquidationIncentive = liquidationIncentiveRaw !== null ? Number(liquidationIncentiveRaw) / 1e18 : 0

  const PRICE_MAP: Record<string, number> = {
    MON: monPrice, WMON: monPrice,
    USDC: 1, USDT: 1, AUSD: 1, USDT0: 1,
    WETH: ethPrice, ETH: ethPrice,
    WBTC: btcPrice, BTC: btcPrice,
  }

  const results = await Promise.allSettled(
    marketAddrs.map(async (addr) => {
      const [symbolRaw, totalSupplyRaw, totalBorrowsRaw, exRateRaw, supplyRateRaw, borrowRateRaw, underlyingRaw] =
        await Promise.allSettled([
          publicClient.readContract({ address: addr, abi: SDRTOKEN_ABI, functionName: 'symbol' }),
          publicClient.readContract({ address: addr, abi: SDRTOKEN_ABI, functionName: 'totalSupply' }),
          publicClient.readContract({ address: addr, abi: SDRTOKEN_ABI, functionName: 'totalBorrows' }),
          publicClient.readContract({ address: addr, abi: SDRTOKEN_ABI, functionName: 'exchangeRateStored' }),
          publicClient.readContract({ address: addr, abi: SDRTOKEN_ABI, functionName: 'supplyRatePerBlock' }),
          publicClient.readContract({ address: addr, abi: SDRTOKEN_ABI, functionName: 'borrowRatePerBlock' }),
          publicClient.readContract({ address: addr, abi: SDRTOKEN_ABI, functionName: 'underlying' }),
        ])

      const symbol     = symbolRaw.status     === 'fulfilled' ? (symbolRaw.value as string)       : addr.slice(0, 10)
      // Exchange rate: 1e18 scaled, totalSupply in sdr-tokens → multiply by exRate/1e28 for underlying units
      const exRate     = exRateRaw.status     === 'fulfilled' ? Number(exRateRaw.value as bigint)  / 1e28 : 1e-8
      const sdrSupply  = totalSupplyRaw.status === 'fulfilled' ? Number(totalSupplyRaw.value as bigint) / 1e8 : 0
      const totalSupply = sdrSupply * exRate   // underlying units

      const totalBorrows = totalBorrowsRaw.status === 'fulfilled' ? Number(totalBorrowsRaw.value as bigint) / 1e18 : 0
      const supplyRate   = supplyRateRaw.status   === 'fulfilled' ? Number(supplyRateRaw.value as bigint)   / 1e18 : 0
      const borrowRate   = borrowRateRaw.status   === 'fulfilled' ? Number(borrowRateRaw.value as bigint)   / 1e18 : 0

      // APY = (1 + rate/block)^blocks_per_year - 1 ≈ rate * blocks_per_year for small rates
      const supplyAPY = (Math.pow(1 + supplyRate, BLOCKS_PER_YEAR) - 1)
      const borrowAPY = (Math.pow(1 + borrowRate, BLOCKS_PER_YEAR) - 1)

      // Resolve underlying symbol for price lookup
      let assetSymbol = symbol.replace(/^sdr/, '')
      if (underlyingRaw.status === 'fulfilled') {
        const asym = await publicClient.readContract({
          address: underlyingRaw.value as `0x${string}`, abi: ERC20_ABI, functionName: 'symbol',
        }).catch(() => null)
        if (asym) assetSymbol = asym as string
      }

      const price  = PRICE_MAP[assetSymbol.toUpperCase()] ?? 1
      const tvlUSD = totalSupply * price

      const borrowCapRaw = await publicClient.readContract({
        address: SUMER_ADDRESSES.Comptroller, abi: COMPTROLLER_ABI,
        functionName: 'borrowCaps', args: [addr],
      }).catch(() => null)
      const borrowCap = borrowCapRaw !== null ? Number(borrowCapRaw as bigint) / 1e18 : 0

      return {
        address: addr, symbol, asset: assetSymbol,
        totalSupply, totalBorrows, supplyAPY, borrowAPY, tvlUSD,
        borrowCap, closeFactor, liquidationIncentive,
        protocol: 'sumer' as const,
      } satisfies SumerMarket
    })
  )

  return results
    .flatMap(r => r.status === 'fulfilled' ? [r.value as SumerMarket] : [])
    .filter(m => m.totalSupply > 0 || m.totalBorrows > 0)
}

/**
 * Returns total Sumer Money TVL on Monad in USD.
 *
 * Sums the USD value of underlying assets supplied across all active sdr-token markets.
 *
 * @returns Total TVL in USD across all Sumer lending markets
 *
 * @example
 * ```typescript
 * const tvl = await getSumerTVL()
 * // → 1950000
 * ```
 *
 * @category Lending
 */
export async function getSumerTVL(): Promise<number> {
  const markets = await getSumerMarkets()
  return markets.reduce((s, m) => s + m.tvlUSD, 0)
}
