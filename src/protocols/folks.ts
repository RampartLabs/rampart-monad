/**
 * @module Folks
 * @description Folks Finance cross-chain lending spoke markets on Monad.
 * Spoke tokens represent supply/borrow positions bridged from the Hub chain via Wormhole and CCIP.
 *
 * **TVL:** ~$3M
 * **Type:** Cross-Chain Lending
 * **Docs:** https://folks.finance
 *
 * Available functions:
 * - {@link getFolksMarkets} — all Folks Finance spoke token markets on Monad
 * - {@link getFolksTVL} — total USD across all Folks Finance markets
 */

// ============================================================
// Rampart SDK — Folks Finance on Monad
// Cross-chain lending protocol. Monad spoke contracts bridge
// lending markets from Hub chain to Monad.
// Source: github.com/monad-crypto/protocols/mainnet/folks_finance.jsonc
// ============================================================

import { publicClient } from '../chain'
import { getVerifiedPrice } from './oracles'

export const FOLKS_ADDRESSES = {
  spokeCommon:            '0xc7bc4A43384f84B8FC937Ab58173Edab23a4c3cD' as `0x${string}`,
  bridgeRouterSpoke:      '0xF854AC65A40f1EabFD32E6D4C7d0E1c4B1753Cc5' as `0x${string}`,
  wormholeDataAdapter:    '0x37d761883a01e9F0B0d7fe59EEC8c21D94393CDD' as `0x${string}`,
  ccipDataAdapter:        '0xeB48a1eE43B91959A1686b70B7Cd482c65DE69c9' as `0x${string}`,
  // Spoke market tokens (supply/borrow positions)
  monSpoke:               '0x531490B7674ef239C9FEC39d2Cf3Cc10645d14d4' as `0x${string}`,
  wBtcSpoke:              '0xF4c542518320F09943C35Db6773b2f9FeB2F847e' as `0x${string}`,
  wEthSpoke:              '0xe3B0e4Db870aA58A24f87d895c62D3dc5CD05883' as `0x${string}`,
  sMonSpoke:              '0xb39c03297E87032fFF69f4D42A6698e4c4A934449' as `0x${string}`,
  aUsdSpoke:              '0xC30107a8e782E98Fe890f0375afa4185aeEa3356' as `0x${string}`,
  usdt0Spoke:             '0xB1e2939b501B73F4cFEf6a9FB0aa89a75F1774EE' as `0x${string}`,
  gMonSpoke:              '0x9105CEEbaf43EF6B80dF1b66BEfFd5F98A036c36' as `0x${string}`,
  shMonSpoke:             '0x1A40208E9506E08a6f62DbCCf8de7387743179E9' as `0x${string}`,
} as const

// ERC20 / spoke token ABI — spokes are ERC20 tokens representing positions
const SPOKE_ABI = [
  { name: 'totalSupply',  type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'symbol',       type: 'function' as const, inputs: [], outputs: [{ type: 'string' }],  stateMutability: 'view' as const },
  { name: 'decimals',     type: 'function' as const, inputs: [], outputs: [{ type: 'uint8' }],   stateMutability: 'view' as const },
] as const

// Spoke common ABI — cross-chain messaging interface
const SPOKE_COMMON_ABI = [
  { name: 'spokeChainId', type: 'function' as const, inputs: [], outputs: [{ type: 'uint16' }], stateMutability: 'view' as const },
] as const

export interface FolksMarket {
  symbol:       string
  spokeAddress: string
  totalSupply:  number   // token units
  decimals:     number
  tvlUSD:       number   // estimated — supply × assumed price
  protocol:     'folks'
}

const STABLECOINS = new Set(['AUSD', 'USDT0', 'USDC', 'USDT'])

async function getFolksPrices(): Promise<Record<string, number>> {
  const [monR, btcR, ethR] = await Promise.allSettled([
    getVerifiedPrice('MON'),
    getVerifiedPrice('WBTC'),
    getVerifiedPrice('WETH'),
  ])
  const mon = monR.status === 'fulfilled' ? monR.value.bestPrice : 0.031
  const btc = btcR.status === 'fulfilled' ? btcR.value.bestPrice : 95000
  const eth = ethR.status === 'fulfilled' ? ethR.value.bestPrice : 1800
  return {
    MON: mon, WMON: mon, SMON: mon, GMON: mon, SHMON: mon,
    WBTC: btc, BTC: btc,
    WETH: eth, ETH: eth,
    AUSD: 1, USDT0: 1, USDC: 1, USDT: 1,
  }
}

const SPOKE_MARKETS: Array<{ key: keyof typeof FOLKS_ADDRESSES; symbol: string }> = [
  { key: 'monSpoke',   symbol: 'MON'   },
  { key: 'wBtcSpoke',  symbol: 'WBTC'  },
  { key: 'wEthSpoke',  symbol: 'WETH'  },
  { key: 'sMonSpoke',  symbol: 'sMON'  },
  { key: 'aUsdSpoke',  symbol: 'AUSD'  },
  { key: 'usdt0Spoke', symbol: 'USDT0' },
  { key: 'gMonSpoke',  symbol: 'gMON'  },
  { key: 'shMonSpoke', symbol: 'shMON' },
]

/**
 * Returns all Folks Finance spoke token markets on Monad.
 *
 * Spoke tokens represent cross-chain lending positions (supply/borrow) bridged
 * from the Hub chain to Monad via Wormhole and CCIP adapters.
 *
 * @returns Array of {@link FolksMarket} objects with supply, decimals, and estimated USD TVL
 *
 * @example
 * ```typescript
 * const markets = await getFolksMarkets()
 * // → [{ symbol: 'WETH', totalSupply: 120.5, tvlUSD: 216900, protocol: 'folks', ... }, ...]
 * ```
 *
 * @category Lending
 */
export async function getFolksMarkets(): Promise<FolksMarket[]> {
  const prices = await getFolksPrices()

  const results = await Promise.allSettled(
    SPOKE_MARKETS.map(async ({ key, symbol }) => {
      const addr = FOLKS_ADDRESSES[key]
      const [totalSupplyRaw, decimalsRaw] = await Promise.allSettled([
        publicClient.readContract({ address: addr, abi: SPOKE_ABI, functionName: 'totalSupply' }),
        publicClient.readContract({ address: addr, abi: SPOKE_ABI, functionName: 'decimals' }),
      ])

      const decimals    = decimalsRaw.status    === 'fulfilled' ? Number(decimalsRaw.value as number) : 18
      const totalSupply = totalSupplyRaw.status === 'fulfilled' ? Number(totalSupplyRaw.value as bigint) / (10 ** decimals) : 0
      const price       = prices[symbol.toUpperCase()] ?? 1

      return {
        symbol,
        spokeAddress: addr,
        totalSupply,
        decimals,
        tvlUSD:       totalSupply * price,
        protocol:     'folks' as const,
      } satisfies FolksMarket
    })
  )

  return results
    .flatMap(r => r.status === 'fulfilled' ? [r.value as FolksMarket] : [])
    .filter(m => m.totalSupply > 0)
}

/**
 * Returns the total TVL of Folks Finance on Monad in USD.
 *
 * Sums the estimated USD value of all spoke token market supplies.
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
