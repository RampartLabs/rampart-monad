// ============================================================
// Rampart SDK — Core Types
// Chain: Monad Mainnet (chainId: 143)
// ============================================================

export interface TokenPrice {
  token: string
  price: number       // USD
  priceInMON?: number
  source: 'kuru' | 'uniswap'
  timestamp: number
}

export interface StakingAPR {
  protocol: 'apriori'
  apr: number         // e.g. 0.124 = 12.4%
  tvl: number         // in MON
  exchangeRate: number // 1 aprMON = X MON
  timestamp: number
}

export interface LendingRate {
  protocol: 'neverland'
  asset: string       // e.g. 'USDC', 'WMON', 'WETH'
  assetAddress: string
  supplyAPY: number   // e.g. 0.082 = 8.2%
  borrowAPR: number
  utilizationRate: number  // 0..1
  totalSupply: number  // in asset units
  totalBorrow: number
}

export interface Pool {
  protocol: 'kuru' | 'uniswap'
  address?: string
  token0: string
  token1: string
  tvl?: number        // USD
  volume24h?: number  // USD
  fee?: number        // e.g. 0.003 = 0.3%
}

export interface Orderbook {
  symbol: string
  bids: [number, number][]  // [price, size]
  asks: [number, number][]
  spread: number
  midPrice: number
  timestamp: number
}

export interface SwapSimulation {
  tokenIn: string
  tokenOut: string
  amountIn: number
  amountOut: number
  priceImpact: number   // e.g. 0.005 = 0.5%
  slippage: number
  route: string
}

export interface PriceComparison {
  token: string
  kuru: number
  uniswap: number
  spread: number        // absolute
  spreadPct: number     // percentage
  best: 'kuru' | 'uniswap'
}

export interface YieldComparison {
  staking: StakingAPR
  bestLending: LendingRate
  recommendation: 'staking' | 'lending'
  reason: string
}

export interface YieldStrategy {
  type: 'staking' | 'lending' | 'lp'
  protocol: string
  asset: string
  apy: number
  risk: 'low' | 'medium' | 'high'
  description: string
}

export interface MarketOverview {
  monPrice: number
  stakingAPR: StakingAPR
  topLendingRates: LendingRate[]
  topPools: Pool[]
  timestamp: number
}

export interface NetworkStats {
  blockNumber: number
  blockTime: number   // ms
  tps: number
  chainId: number
}

export interface ValidatorStats {
  totalValidators: number
  activeValidators: number
  totalStaked: number
}

export interface BlockInfo {
  number: number
  hash: string
  timestamp: number
  transactions: number
}

export interface RealtimeSwap {
  txHash: string
  blockNumber: number
  protocol: string
  tokenIn: string
  tokenOut: string
  amountIn: bigint
  amountOut: bigint
  sender: string
  timestamp: number
}

// ── Phase 9 — Multi-DEX Router ───────────────────────────────

export type DexName = 'kuru' | 'uniswap-v2' | 'uniswap-v3' | 'pancake-v2' | 'pancake-v3' | 'openocean'

export interface SwapRoute {
  dex:            DexName
  amountIn:       number
  amountOut:      number
  tokenIn:        string
  tokenOut:       string
  priceImpact:    number
  effectivePrice: number
  fee?:           number
  isBest:         boolean
  warning?:       string
}

export interface RouterResult {
  tokenIn:      string
  tokenOut:     string
  amountIn:     number
  best:         SwapRoute
  all:          SwapRoute[]
  savedVsBest:  number
}

// ── Phase 10 — LST Aggregator ────────────────────────────────

export interface LSTStats {
  token:           'aprMON' | 'sMON' | 'gMON' | 'shMON' | 'vshMON'
  protocol:        string
  contractAddress: string
  apr:             number
  tvl:             number
  exchangeRate:    number
  risk:            'low' | 'medium' | 'high'
  timestamp:       number
}

export interface StakingEvent {
  txHash: string
  blockNumber: number
  type: 'stake' | 'unstake' | 'redeem'
  user: string
  assets: bigint
  shares: bigint
  timestamp: number
}
