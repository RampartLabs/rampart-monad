/**
 * @module Folks
 * @description Folks Finance cross-chain lending spoke markets on Monad.
 * Spoke tokens represent supply/borrow positions bridged from the Hub chain via Wormhole and CCIP.
 * Interest rates are read from Hub Pool contracts on Avalanche (hub chain).
 *
 * **TVL:** ~$3M
 * **Type:** Cross-Chain Lending
 * **Docs:** https://folks.finance
 *
 * Available functions:
 * - {@link getFolksMarkets} — all Folks Finance spoke token markets on Monad with APR data
 * - {@link getFolksTVL} — total USD across all Folks Finance markets
 */

// ============================================================
// Rampart SDK — Folks Finance on Monad
// Cross-chain lending protocol. Monad spoke contracts bridge
// lending markets from Hub chain to Monad.
// Interest rates live on HubPool contracts on Avalanche C-Chain (chainId 43114).
// Source: github.com/monad-crypto/protocols/mainnet/folks_finance.jsonc
//         docs.xapp.folks.finance/developers/contracts
// ============================================================

import { createPublicClient, http } from 'viem'
import { avalanche } from 'viem/chains'
import { publicClient } from '../chain'
import { getVerifiedPrice } from './oracles'

export const FOLKS_ADDRESSES = {
  spokeCommon:            '0xc7bc4A43384f84B8FC937Ab58173Edab23a4c3cD' as `0x${string}`,
  bridgeRouterSpoke:      '0xF854AC65A40f1EabFD32E6D4C7d0E1c4B1753Cc5' as `0x${string}`,
  wormholeDataAdapter:    '0x37d761883a01e9F0B0d7fe59EEC8c21D94393CDD' as `0x${string}`,
  ccipDataAdapter:        '0xeB48a1eE43B91959A1686b70B7Cd482c65DE69c9' as `0x${string}`,
  monSpoke:               '0x531490B7674ef239C9FEC39d2Cf3Cc10645d14d4' as `0x${string}`,
  wBtcSpoke:              '0xF4c542518320F09943C35Db6773b2f9FeB2F847e' as `0x${string}`,
  wEthSpoke:              '0xe3B0e4Db870aA58A24f87d895c62D3dc5CD05883' as `0x${string}`,
  sMonSpoke:              '0xb39c03297E87032fFF69f4D42A6698e4c4A934449' as `0x${string}`,
  aUsdSpoke:              '0xC30107a8e782E98Fe890f0375afa4185aeEa3356' as `0x${string}`,
  usdt0Spoke:             '0xB1e2939b501B73F4cFEf6a9FB0aa89a75F1774EE' as `0x${string}`,
  gMonSpoke:              '0x9105CEEbaf43EF6B80dF1b66BEfFd5F98A036c36' as `0x${string}`,
  shMonSpoke:             '0x1A40208E9506E08a6f62DbCCf8de7387743179E9' as `0x${string}`,
} as const

// HubPool addresses on Avalanche C-Chain per asset
// Source: docs.xapp.folks.finance/developers/contracts
const FOLKS_HUB_POOLS: Record<string, `0x${string}`> = {
  MON:   '0x10a4481F79aAC209aC6c2959B785F2e303912Dc5',
  WBTC:  '0xdc887aCFe154BF0048Ae15Cda3693Ab2C237431A',
  WETH:  '0xD7Ff49751DAF42Bf7AFC4fF5C958d4bea48358D3',
  SMON:  '0x5562d84f9891288fc72aaB1d857797c7275Fcedb',
  AUSD:  '0x4fb4c3A33cBe855C5d87078c1BbBe5f371417faC',
  USDT0: '0xd9D50D4F73f61A306b47e5BdC825E98cd11139dc',
  GMON:  '0x0b4e69C4890a88acA90E7e71dB76619C3AaCD79D',
  SHMON: '0x398715A6011391B2B7fD1fF66BB26c126E5d4aAC',
}

const avalancheClient = createPublicClient({
  chain: avalanche,
  transport: http('https://api.avax.network/ext/bc/C/rpc', {
    timeout: 10_000,
    retryCount: 2,
    retryDelay: 500,
  }),
})

const SPOKE_ABI = [
  { name: 'totalSupply', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'symbol',      type: 'function' as const, inputs: [], outputs: [{ type: 'string' }],  stateMutability: 'view' as const },
  { name: 'decimals',    type: 'function' as const, inputs: [], outputs: [{ type: 'uint8' }],   stateMutability: 'view' as const },
] as const

const SPOKE_COMMON_ABI = [
  { name: 'spokeChainId', type: 'function' as const, inputs: [], outputs: [{ type: 'uint16' }], stateMutability: 'view' as const },
] as const

// HubPoolState getters — returns structs with interestRate (18 decimals, per-second)
const HUB_POOL_ABI = [
  {
    name: 'getDepositData',
    type: 'function' as const,
    inputs: [],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'optimalUtilisationRatio', type: 'uint16'  },
        { name: 'totalAmount',             type: 'uint256' },
        { name: 'interestRate',            type: 'uint256' },
        { name: 'interestIndex',           type: 'uint256' },
      ],
    }],
    stateMutability: 'view' as const,
  },
  {
    name: 'getVariableBorrowData',
    type: 'function' as const,
    inputs: [],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'vr0',            type: 'uint32'  },
        { name: 'vr1',            type: 'uint32'  },
        { name: 'vr2',            type: 'uint32'  },
        { name: 'totalAmount',    type: 'uint256' },
        { name: 'interestRate',   type: 'uint256' },
        { name: 'interestIndex',  type: 'uint256' },
      ],
    }],
    stateMutability: 'view' as const,
  },
  {
    name: 'getStableBorrowData',
    type: 'function' as const,
    inputs: [],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'sr0',                          type: 'uint32'  },
        { name: 'sr1',                          type: 'uint32'  },
        { name: 'sr2',                          type: 'uint32'  },
        { name: 'sr3',                          type: 'uint32'  },
        { name: 'optimalStableToTotalDebtRatio', type: 'uint16' },
        { name: 'rebalanceUpUtilisationRatio',   type: 'uint16' },
        { name: 'rebalanceUpDepositInterestRate', type: 'uint16' },
        { name: 'rebalanceDownDelta',            type: 'uint16' },
        { name: 'totalAmount',                   type: 'uint256' },
        { name: 'interestRate',                  type: 'uint256' },
        { name: 'averageInterestRate',           type: 'uint256' },
      ],
    }],
    stateMutability: 'view' as const,
  },
] as const

const SECONDS_PER_YEAR = 31_536_000

interface HubRates {
  depositAPR:        number
  variableBorrowAPR: number
  stableBorrowAPR:   number
  totalBorrows:      number
  totalDeposits:     number
}

async function getHubRates(hubKey: string): Promise<HubRates | null> {
  const poolAddr = FOLKS_HUB_POOLS[hubKey]
  if (!poolAddr) return null
  try {
    const [depositData, varBorrowData, stableBorrowData] = await Promise.all([
      avalancheClient.readContract({ address: poolAddr, abi: HUB_POOL_ABI, functionName: 'getDepositData' }),
      avalancheClient.readContract({ address: poolAddr, abi: HUB_POOL_ABI, functionName: 'getVariableBorrowData' }),
      avalancheClient.readContract({ address: poolAddr, abi: HUB_POOL_ABI, functionName: 'getStableBorrowData' }),
    ])
    const deposit     = depositData     as { interestRate: bigint; totalAmount: bigint }
    const varBorrow   = varBorrowData   as { interestRate: bigint; totalAmount: bigint }
    const stblBorrow  = stableBorrowData as { interestRate: bigint; totalAmount: bigint }

    const depositAPR        = (Number(deposit.interestRate)   / 1e18) * SECONDS_PER_YEAR
    const variableBorrowAPR = (Number(varBorrow.interestRate) / 1e18) * SECONDS_PER_YEAR
    const stableBorrowAPR   = (Number(stblBorrow.interestRate) / 1e18) * SECONDS_PER_YEAR
    const totalBorrows      = Number(varBorrow.totalAmount + stblBorrow.totalAmount) / 1e18
    const totalDeposits     = Number(deposit.totalAmount) / 1e18

    return { depositAPR, variableBorrowAPR, stableBorrowAPR, totalBorrows, totalDeposits }
  } catch {
    return null
  }
}

export interface FolksMarket {
  symbol:            string
  spokeAddress:      string
  spokeChainId:      number
  totalSupply:       number
  decimals:          number
  tvlUSD:            number
  depositAPR:        number | null
  variableBorrowAPR: number | null
  stableBorrowAPR:   number | null
  totalBorrows:      number | null
  protocol:          'folks'
}

const SPOKE_MARKETS: Array<{ key: keyof typeof FOLKS_ADDRESSES; symbol: string; hubKey: string }> = [
  { key: 'monSpoke',   symbol: 'MON',   hubKey: 'MON'   },
  { key: 'wBtcSpoke',  symbol: 'WBTC',  hubKey: 'WBTC'  },
  { key: 'wEthSpoke',  symbol: 'WETH',  hubKey: 'WETH'  },
  { key: 'sMonSpoke',  symbol: 'sMON',  hubKey: 'SMON'  },
  { key: 'aUsdSpoke',  symbol: 'AUSD',  hubKey: 'AUSD'  },
  { key: 'usdt0Spoke', symbol: 'USDT0', hubKey: 'USDT0' },
  { key: 'gMonSpoke',  symbol: 'gMON',  hubKey: 'GMON'  },
  { key: 'shMonSpoke', symbol: 'shMON', hubKey: 'SHMON' },
]

const STABLECOINS = new Set(['AUSD', 'USDT0', 'USDC', 'USDT'])

/**
 * Returns all Folks Finance spoke token markets on Monad with APR data from Hub chain.
 *
 * Spoke tokens represent cross-chain lending positions bridged via Wormhole and CCIP.
 * Token decimals are read on-chain from each spoke ERC20. Prices use `getVerifiedPrice()`
 * from oracles.ts — no fallback price of 1 for unknown symbols.
 * Interest rates (deposit APR, variable/stable borrow APR) are read from HubPool contracts
 * on Avalanche C-Chain via a separate viem client.
 *
 * @returns Array of {@link FolksMarket} objects with supply, TVL, and APR data
 *
 * @example
 * ```typescript
 * const markets = await getFolksMarkets()
 * // → [{ symbol: 'WETH', totalSupply: 120.5, tvlUSD: 216900, depositAPR: 0.032, ... }]
 * ```
 *
 * @category Lending
 */
export async function getFolksMarkets(): Promise<FolksMarket[]> {
  const spokeChainIdRaw = await publicClient.readContract({
    address: FOLKS_ADDRESSES.spokeCommon,
    abi: SPOKE_COMMON_ABI,
    functionName: 'spokeChainId',
  }).catch(() => null)
  const spokeChainId = spokeChainIdRaw !== null ? Number(spokeChainIdRaw) : 0

  const results = await Promise.allSettled(
    SPOKE_MARKETS.map(async ({ key, symbol, hubKey }) => {
      const addr = FOLKS_ADDRESSES[key]

      const [totalSupplyRaw, decimalsRaw, hubRates] = await Promise.allSettled([
        publicClient.readContract({ address: addr, abi: SPOKE_ABI, functionName: 'totalSupply' }),
        publicClient.readContract({ address: addr, abi: SPOKE_ABI, functionName: 'decimals' }),
        getHubRates(hubKey),
      ])

      const decimals    = decimalsRaw.status    === 'fulfilled' ? Number(decimalsRaw.value as number) : null
      if (decimals === null) return null

      const divisor     = BigInt(10) ** BigInt(decimals)
      const totalSupply = totalSupplyRaw.status === 'fulfilled'
        ? Number((totalSupplyRaw.value as bigint) / divisor)
        : 0

      let price: number | null = null
      if (STABLECOINS.has(symbol.toUpperCase())) {
        price = 1
      } else {
        const LST_TO_MON = new Set(['SMON', 'GMON', 'SHMON'])
        const priceSymbol = LST_TO_MON.has(symbol.toUpperCase()) ? 'MON' : symbol
        try {
          const verified = await getVerifiedPrice(priceSymbol)
          price = verified.bestPrice
        } catch {
          price = null
        }
      }

      const rates = hubRates.status === 'fulfilled' ? hubRates.value : null

      return {
        symbol,
        spokeAddress:      addr,
        spokeChainId,
        totalSupply,
        decimals,
        tvlUSD:            price !== null ? totalSupply * price : 0,
        depositAPR:        rates?.depositAPR        ?? null,
        variableBorrowAPR: rates?.variableBorrowAPR ?? null,
        stableBorrowAPR:   rates?.stableBorrowAPR   ?? null,
        totalBorrows:      rates?.totalBorrows       ?? null,
        protocol:          'folks' as const,
      } satisfies FolksMarket
    })
  )

  return results
    .flatMap(r => r.status === 'fulfilled' && r.value !== null ? [r.value as FolksMarket] : [])
    .filter(m => m.totalSupply > 0)
}

/**
 * Returns the total TVL of Folks Finance on Monad in USD.
 *
 * @returns Total TVL in USD across all active Folks Finance spoke markets
 *
 * @example
 * ```typescript
 * const tvl = await getFolksTVL()
 * // → 3200000
 * ```
 *
 * @category Lending
 */
export async function getFolksTVL(): Promise<number> {
  const markets = await getFolksMarkets()
  return markets.reduce((s, m) => s + m.tvlUSD, 0)
}
