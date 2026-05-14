/**
 * @module Perps
 * @description Perpetuals protocols on Monad: Perpl Exchange and Monday Trade.
 *
 * **Perpl Exchange** — fully on-chain perpetuals (BTC, MON, ETH, SOL).
 * ABI sourced from https://github.com/PerplFoundation/dex-sdk.
 * Collateral: AUSD (6 dec). TVL ~$1.08M.
 * perpIds discovered dynamically (1–50 probe).
 *
 * **Monday Trade** — Uniswap V3 fork DEX (spot only, Uni V3 ABI applies).
 * Perpetuals layer runs on SynFutures infrastructure (unverified contracts).
 *
 * **TVL:** ~$1.1M (Perpl)
 * **Type:** Perpetuals
 * **Docs:** https://app.perpl.xyz | https://monday.trade
 *
 * Available functions:
 * - {@link getMondayMarkets} — Monday Trade spot pools (Uniswap V3 factory)
 * - {@link getPerplMarkets} — Perpl perpetual markets with OI, price, funding rates
 * - {@link getPerplTVL} — total AUSD collateral in Perpl Exchange
 * - {@link getPerpVaultStats} — vault utilization and TVL for all perp protocols
 * - {@link getFundingRates} — current funding rates across perp protocols
 * - {@link getTotalPerpTVL} — combined TVL across all perp protocols on Monad
 */

import { publicClient } from '../chain'

// ── Monday Trade ─────────────────────────────────────────────
// Uniswap V3 fork — spot DEX (standard Uni V3 factory ABI)
const MONDAY_FACTORY:     `0x${string}` = '0xC1e98D0A2a58fB8aBd10ccc30a58efff4080Aa21'
const MONDAY_SWAP_ROUTER: `0x${string}` = '0xFE951b693A2FE54BE5148614B109E316B567632F'
const MONDAY_QUOTER_V2:   `0x${string}` = '0xB97eCD41Aef0F842E773C8F9905919cDE49880C9'

// ── Perpl Exchange ────────────────────────────────────────────
// UUPS proxy; implementation 0xff7b68ae2edf9b87178570a2384097a99520e97e
// ABI: github.com/PerplFoundation/dex-sdk/blob/main/abi/dex/Exchange.json
const PERPL_EXCHANGE: `0x${string}` = '0x34B6552d57a35a1D042CcAe1951BD1C370112a6F'

// CNS = AUSD with 6 decimals; PNS = price in 10^priceDecimals; LNS = lot in 10^lotDecimals
const EXCHANGE_INFO_ABI = [{
  name: 'getExchangeInfo', type: 'function' as const, stateMutability: 'view' as const,
  inputs: [],
  outputs: [{ type: 'tuple', components: [
    { name: 'balanceCNS',         type: 'uint256' },
    { name: 'protocolBalanceCNS', type: 'uint256' },
    { name: 'recycleBalanceCNS',  type: 'uint256' },
    { name: 'collateralDecimals', type: 'uint256' },
    { name: 'collateralToken',    type: 'address' },
    { name: 'verifierProxy',      type: 'address' },
  ]}]
}] as const

const PERP_INFO_ABI = [{
  name: 'getPerpetualInfo', type: 'function' as const, stateMutability: 'view' as const,
  inputs: [{ name: 'perpId', type: 'uint256' }],
  outputs: [{ type: 'tuple', components: [
    { name: 'name',                     type: 'string'  },
    { name: 'symbol',                   type: 'string'  },
    { name: 'priceDecimals',            type: 'uint256' },
    { name: 'lotDecimals',              type: 'uint256' },
    { name: 'linkFeedId',               type: 'bytes32' },
    { name: 'priceTolPer100K',          type: 'uint256' },
    { name: 'marginTol',                type: 'uint256' },
    { name: 'marginTolDecimals',        type: 'uint256' },
    { name: 'refPriceMaxAgeSec',        type: 'uint256' },
    { name: 'positionBalanceCNS',       type: 'uint256' },
    { name: 'insuranceBalanceCNS',      type: 'uint256' },
    { name: 'markPNS',                  type: 'uint256' },
    { name: 'markTimestamp',            type: 'uint256' },
    { name: 'lastPNS',                  type: 'uint256' },
    { name: 'lastTimestamp',            type: 'uint256' },
    { name: 'oraclePNS',                type: 'uint256' },
    { name: 'oracleTimestampSec',       type: 'uint256' },
    { name: 'longOpenInterestLNS',      type: 'uint256' },
    { name: 'shortOpenInterestLNS',     type: 'uint256' },
    { name: 'fundingStartBlock',        type: 'uint256' },
    { name: 'fundingRatePct100k',       type: 'int16'   },
    { name: 'absFundingClampPctPer100K',type: 'uint256' },
    { name: 'status',                   type: 'uint8'   },
    { name: 'basePricePNS',             type: 'uint256' },
    { name: 'maxBidPriceONS',           type: 'uint256' },
    { name: 'minBidPriceONS',           type: 'uint256' },
    { name: 'maxAskPriceONS',           type: 'uint256' },
    { name: 'minAskPriceONS',           type: 'uint256' },
    { name: 'numOrders',                type: 'uint256' },
    { name: 'ignOracle',                type: 'bool'    },
  ]}]
}] as const

const MISC_ABI = [
  { name: 'numberOfAccounts',  type: 'function' as const, stateMutability: 'view' as const, inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'getFundingInterval',type: 'function' as const, stateMutability: 'view' as const, inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'isHalted',          type: 'function' as const, stateMutability: 'view' as const, inputs: [], outputs: [{ type: 'bool'    }] },
] as const

// Uniswap V3 factory — used for Monday Trade pool discovery
const UNI_V3_FACTORY_ABI = [
  { name: 'getPool', type: 'function' as const, stateMutability: 'view' as const,
    inputs: [{ name: 'tokenA', type: 'address' }, { name: 'tokenB', type: 'address' }, { name: 'fee', type: 'uint24' }],
    outputs: [{ type: 'address' }] },
] as const

const POOL_CREATED_EVENT_ABI = [{
  name: 'PoolCreated', type: 'event' as const,
  inputs: [
    { name: 'token0', type: 'address', indexed: true  },
    { name: 'token1', type: 'address', indexed: true  },
    { name: 'fee',    type: 'uint24',  indexed: true  },
    { name: 'tickSpacing', type: 'int24', indexed: false },
    { name: 'pool',   type: 'address', indexed: false },
  ],
}] as const

const UNI_V3_POOL_ABI = [
  { name: 'token0',    type: 'function' as const, stateMutability: 'view' as const, inputs: [], outputs: [{ type: 'address' }] },
  { name: 'token1',    type: 'function' as const, stateMutability: 'view' as const, inputs: [], outputs: [{ type: 'address' }] },
  { name: 'fee',       type: 'function' as const, stateMutability: 'view' as const, inputs: [], outputs: [{ type: 'uint24' }]  },
  { name: 'liquidity', type: 'function' as const, stateMutability: 'view' as const, inputs: [], outputs: [{ type: 'uint128' }] },
  { name: 'slot0',     type: 'function' as const, stateMutability: 'view' as const, inputs: [], outputs: [
    { name: 'sqrtPriceX96', type: 'uint160' },
    { name: 'tick',         type: 'int24'   },
    { name: 'observationIndex', type: 'uint16' },
    { name: 'observationCardinality', type: 'uint16' },
    { name: 'observationCardinalityNext', type: 'uint16' },
    { name: 'feeProtocol', type: 'uint8' },
    { name: 'unlocked', type: 'bool' },
  ]},
] as const

const ERC20_SYMBOL_ABI = [
  { name: 'symbol',   type: 'function' as const, stateMutability: 'view' as const, inputs: [], outputs: [{ type: 'string' }] },
  { name: 'decimals', type: 'function' as const, stateMutability: 'view' as const, inputs: [], outputs: [{ type: 'uint8'  }] },
] as const

export interface PerpMarket {
  protocol:          'monday' | 'perpl'
  perpId:            number
  asset:             string
  markPrice:         number
  oraclePrice:       number
  longOI:            number
  shortOI:           number
  totalOI:           number
  fundingRatePct:    number
  fundingInterval:   number
  tvlUSD:            number
  maxBid:            number
  minBid:            number
  sentiment:         'bullish' | 'bearish' | 'neutral'
  isHalted?:         boolean
}

export interface PerpVaultStats {
  protocol:        'monday' | 'perpl'
  tvl:             number
  totalOI:         number
  utilizationRate: number
  accounts:        number
}

async function probePerplMarkets(): Promise<PerpMarket[]> {
  const [fundingInterval, exchangeInfo, halted] = await Promise.all([
    publicClient.readContract({ address: PERPL_EXCHANGE, abi: MISC_ABI, functionName: 'getFundingInterval' }).catch(() => 8571n),
    publicClient.readContract({ address: PERPL_EXCHANGE, abi: EXCHANGE_INFO_ABI, functionName: 'getExchangeInfo' }).catch(() => null),
    publicClient.readContract({ address: PERPL_EXCHANGE, abi: MISC_ABI, functionName: 'isHalted' }).catch(() => false),
  ])

  const collateralDecimals = exchangeInfo
    ? Number((exchangeInfo as { collateralDecimals: bigint }).collateralDecimals)
    : 6
  const collateralDivisor = 10n ** BigInt(collateralDecimals)

  const MAX_PROBE = 50
  const results = await Promise.allSettled(
    Array.from({ length: MAX_PROBE }, (_, i) =>
      publicClient.readContract({
        address: PERPL_EXCHANGE, abi: PERP_INFO_ABI, functionName: 'getPerpetualInfo', args: [BigInt(i + 1)],
      })
    )
  )

  const markets: PerpMarket[] = []
  let consecutiveFails = 0
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.status !== 'fulfilled') {
      consecutiveFails++
      if (consecutiveFails >= 3) break
      continue
    }
    consecutiveFails = 0
    const p = r.value as {
      name: string; symbol: string; priceDecimals: bigint; lotDecimals: bigint;
      positionBalanceCNS: bigint; markPNS: bigint; oraclePNS: bigint;
      longOpenInterestLNS: bigint; shortOpenInterestLNS: bigint;
      fundingRatePct100k: number; maxBidPriceONS: bigint; minBidPriceONS: bigint;
    }
    const pd    = Number(p.priceDecimals)
    const ld    = Number(p.lotDecimals)
    const scale = 10 ** pd
    const longOI  = Number(p.longOpenInterestLNS)  / 10 ** ld
    const shortOI = Number(p.shortOpenInterestLNS) / 10 ** ld
    markets.push({
      protocol:        'perpl',
      perpId:          i + 1,
      asset:           p.symbol,
      markPrice:       Number(p.markPNS)    / scale,
      oraclePrice:     Number(p.oraclePNS)  / scale,
      longOI,
      shortOI,
      totalOI:         longOI + shortOI,
      fundingRatePct:  p.fundingRatePct100k / 100000,
      fundingInterval: Number(fundingInterval),
      tvlUSD:          Number(p.positionBalanceCNS / collateralDivisor),
      maxBid:          Number(p.maxBidPriceONS) / scale,
      minBid:          Number(p.minBidPriceONS) / scale,
      sentiment:       longOI > shortOI * 1.1 ? 'bullish' : shortOI > longOI * 1.1 ? 'bearish' : 'neutral',
      isHalted:        halted as boolean,
    })
  }
  return markets
}

/**
 * Returns Monday Trade spot pools from the Uniswap V3 factory on Monad.
 * Monday Trade is a Uniswap V3 fork — discovers pools via PoolCreated events (last 500K blocks).
 *
 * @returns Array of {@link PerpMarket} with protocol: 'monday', real on-chain data
 *
 * @category Perps
 */
export async function getMondayMarkets(): Promise<PerpMarket[]> {
  try {
    const latestBlock = await publicClient.getBlockNumber()
    const fromBlock   = latestBlock > 500_000n ? latestBlock - 500_000n : 0n

    const logs = await publicClient.getLogs({
      address:   MONDAY_FACTORY,
      event:     POOL_CREATED_EVENT_ABI[0],
      fromBlock,
      toBlock:   latestBlock,
    }).catch(() => [])

    if (logs.length === 0) return []

    const unique = new Map<string, typeof logs[number]>()
    for (const log of logs) {
      const addr = (log.args as any).pool as string
      if (addr && addr !== '0x0000000000000000000000000000000000000000') {
        unique.set(addr.toLowerCase(), log)
      }
    }

    const markets: PerpMarket[] = []

    await Promise.allSettled(
      [...unique.entries()].map(async ([, log]) => {
        const args = log.args as { token0: `0x${string}`; token1: `0x${string}`; fee: number; pool: `0x${string}` }
        const poolAddr = args.pool

        const [slot0Raw, liquidityRaw, sym0, sym1, dec0, dec1] = await Promise.all([
          publicClient.readContract({ address: poolAddr, abi: UNI_V3_POOL_ABI, functionName: 'slot0' }).catch(() => null),
          publicClient.readContract({ address: poolAddr, abi: UNI_V3_POOL_ABI, functionName: 'liquidity' }).catch(() => 0n),
          publicClient.readContract({ address: args.token0, abi: ERC20_SYMBOL_ABI, functionName: 'symbol' }).catch(() => args.token0.slice(0, 8)),
          publicClient.readContract({ address: args.token1, abi: ERC20_SYMBOL_ABI, functionName: 'symbol' }).catch(() => args.token1.slice(0, 8)),
          publicClient.readContract({ address: args.token0, abi: ERC20_SYMBOL_ABI, functionName: 'decimals' }).catch(() => 18),
          publicClient.readContract({ address: args.token1, abi: ERC20_SYMBOL_ABI, functionName: 'decimals' }).catch(() => 18),
        ])

        const s0         = slot0Raw as { sqrtPriceX96: bigint; tick: number; unlocked: boolean } | null
        const sqrtPrice  = s0?.sqrtPriceX96 ?? 0n
        const liquidity  = liquidityRaw as bigint

        let markPrice = 0
        if (sqrtPrice > 0n) {
          const p = Number(sqrtPrice) / 2 ** 96
          const rawPrice = p * p
          const dec0n = Number(dec0)
          const dec1n = Number(dec1)
          markPrice = rawPrice * (10 ** dec0n) / (10 ** dec1n)
        }

        markets.push({
          protocol:      'monday',
          perpId:        0,
          asset:         `${sym0}/${sym1}`,
          markPrice,
          oraclePrice:   markPrice,
          longOI:        0,
          shortOI:       0,
          totalOI:       Number(liquidity) / 1e18,
          fundingRatePct:  0,
          fundingInterval: 0,
          tvlUSD:        0,
          maxBid:        0,
          minBid:        0,
          sentiment:     'neutral',
        })
      })
    )

    return markets
  } catch {
    return []
  }
}

/**
 * Returns Perpl Exchange perpetual markets with open interest, mark price, and funding rates.
 * Probes perpIds 1–50 dynamically — currently active: BTC (1), MON (10), ETH (20), SOL (30).
 *
 * @returns Array of {@link PerpMarket} sorted descending by `tvlUSD`
 *
 * @example
 * ```typescript
 * const markets = await getPerplMarkets()
 * // → [{ asset: 'MON Perp', markPrice: 0.0265, longOI: 1856568, tvlUSD: 40698 }]
 * ```
 *
 * @category Perps
 */
export async function getPerplMarkets(): Promise<PerpMarket[]> {
  try {
    const markets = await probePerplMarkets()
    return markets.sort((a, b) => b.tvlUSD - a.tvlUSD)
  } catch {
    return []
  }
}

/**
 * Returns total AUSD collateral locked in Perpl Exchange.
 * Uses `getExchangeInfo().balanceCNS` — the official on-chain total.
 *
 * @returns TVL in USD (AUSD, 6 decimals, 1:1 with USD)
 *
 * @example
 * ```typescript
 * const tvl = await getPerplTVL()
 * // → 1080962
 * ```
 *
 * @category Perps
 */
export async function getPerplTVL(): Promise<number> {
  try {
    const info = await publicClient.readContract({
      address: PERPL_EXCHANGE, abi: EXCHANGE_INFO_ABI, functionName: 'getExchangeInfo',
    }) as { balanceCNS: bigint; collateralDecimals: bigint }
    const scale = 10 ** Number(info.collateralDecimals)
    return Number(info.balanceCNS) / scale
  } catch {
    return 0
  }
}

/**
 * Returns vault utilization and TVL stats for all perpetual protocols on Monad.
 *
 * @returns Array of {@link PerpVaultStats} for Perpl
 *
 * @example
 * ```typescript
 * const stats = await getPerpVaultStats()
 * // → [{ protocol: 'perpl', tvl: 1080962, totalOI: 83000, utilizationRate: 0.077, accounts: 534 }]
 * ```
 *
 * @category Perps
 */
export async function getPerpVaultStats(): Promise<PerpVaultStats[]> {
  try {
    const [info, markets, accounts] = await Promise.all([
      publicClient.readContract({ address: PERPL_EXCHANGE, abi: EXCHANGE_INFO_ABI, functionName: 'getExchangeInfo' }) as Promise<{ balanceCNS: bigint; collateralDecimals: bigint }>,
      getPerplMarkets(),
      publicClient.readContract({ address: PERPL_EXCHANGE, abi: MISC_ABI, functionName: 'numberOfAccounts' }).catch(() => 0n),
    ])
    const tvl     = Number(info.balanceCNS) / (10 ** Number(info.collateralDecimals))
    const totalOI = markets.reduce((s, m) => s + m.tvlUSD, 0)
    return [{
      protocol:        'perpl',
      tvl,
      totalOI,
      utilizationRate: tvl > 0 ? totalOI / tvl : 0,
      accounts:        Number(accounts),
    }]
  } catch {
    return []
  }
}

/**
 * Returns current funding rates across all Perpl perpetual markets.
 *
 * @returns Array of objects with `protocol`, `asset`, `rate` (% per funding interval), `fundingInterval` (blocks)
 *
 * @example
 * ```typescript
 * const rates = await getFundingRates()
 * // → [{ protocol: 'perpl', asset: 'BTC Perp', rate: 0, fundingInterval: 8571 }]
 * ```
 *
 * @category Perps
 */
export async function getFundingRates(): Promise<{
  protocol: string; asset: string; rate: number; fundingInterval: number
}[]> {
  const markets = await getPerplMarkets()
  return markets.map(m => ({
    protocol:        m.protocol,
    asset:           m.asset,
    rate:            m.fundingRatePct,
    fundingInterval: m.fundingInterval,
  }))
}

/**
 * Returns combined TVL in USD across all perpetual protocols on Monad.
 *
 * @returns Total TVL in USD
 *
 * @example
 * ```typescript
 * const tvl = await getTotalPerpTVL()
 * // → 1080962
 * ```
 *
 * @category Perps
 */
export async function getTotalPerpTVL(): Promise<number> {
  return getPerplTVL()
}

export { MONDAY_FACTORY, MONDAY_SWAP_ROUTER, MONDAY_QUOTER_V2, PERPL_EXCHANGE }
