// ============================================================
// Rampart SDK — Layer 2: Rampart Class
// All protocol functions accessible as methods.
// Provides aggregated "one-call" views across protocols.
// ============================================================

import { getTokenPrice, getKuruPools, getOrderbook, simulateKuruSwap } from './protocols/kuru'
import { getUniswapPools, getUniswapPrice, compareWithKuru } from './protocols/uniswap'
import { getStakingAPR, getAPrioriExchangeRate, getAPrioriTVL, getAPrioriStats } from './protocols/apriori'
import { getLendingRates, getBestSupplyAsset, getBestBorrowAsset, getNeverlandTVL, compareYields } from './protocols/neverland'
import { subscribeToSwaps, subscribeToStaking, subscribeToNewBlocks } from './realtime/envio'
import { getBestSwapRoute, getAllSwapQuotes, detectDexArbitrage } from './aggregators/router'
import { getAllLSTStats, getBestLST, compareLSTs, getTotalStakedMON } from './protocols/staking'
import { getEulerVaults, getEulerBestSupply, getEulerTVL } from './protocols/euler'
import { getVerifiedPrice, getPrices, detectOracleDiscrepancy } from './protocols/oracles'
import { getPortfolio, getPortfolioSummary } from './protocols/portfolio'
import { getMarketOverview as getMarketIntelligence, getBestYields as getTopYields, getMonadDeFiTVL, getArbitrageAlerts } from './aggregators/market'
import { getNadFunTokens, getTrendingMemes } from './protocols/nadfun'
import { getPerpVaultStats, getFundingRates } from './protocols/perps'
import type {
  TokenPrice, StakingAPR, LendingRate, Pool, Orderbook,
  SwapSimulation, PriceComparison, YieldComparison, YieldStrategy,
  MarketOverview, BlockInfo, RealtimeSwap, StakingEvent,
  DexName, SwapRoute, RouterResult, LSTStats,
} from './types'
import type { EulerVault }         from './protocols/euler'
import type { VerifiedPrice }      from './protocols/oracles'
import type { Portfolio }          from './protocols/portfolio'
import type { YieldOpportunity, MonadMarketOverview } from './aggregators/market'

export class Rampart {
  // ── DEX ─────────────────────────────────────────────────────
  getTokenPrice(token: string, quote?: string): Promise<TokenPrice>       { return getTokenPrice(token, quote) }
  getKuruPools():                                Promise<Pool[]>           { return getKuruPools() }
  getOrderbook(symbol: string):                  Promise<Orderbook>        { return getOrderbook(symbol) }
  simulateKuruSwap(tIn: string, tOut: string, amt: number): Promise<SwapSimulation> { return simulateKuruSwap(tIn, tOut, amt) }
  getUniswapPools():                             Promise<Pool[]>           { return getUniswapPools() }
  getUniswapPrice(token: string):                Promise<number>           { return getUniswapPrice(token) }
  compareWithKuru(token: string):                Promise<PriceComparison>  { return compareWithKuru(token) }

  // ── Staking ─────────────────────────────────────────────────
  getStakingAPR():          Promise<StakingAPR> { return getStakingAPR() }
  getAPrioriExchangeRate(): Promise<number>     { return getAPrioriExchangeRate() }
  getAPrioriTVL():          Promise<number>     { return getAPrioriTVL() }
  getAPrioriStats():        Promise<{ apr: number; tvl: number; exchangeRate: number }> { return getAPrioriStats() }

  // ── Lending ──────────────────────────────────────────────────
  getLendingRates():    Promise<LendingRate[]>  { return getLendingRates() }
  getBestSupplyAsset(): Promise<LendingRate>    { return getBestSupplyAsset() }
  getBestBorrowAsset(): Promise<LendingRate>    { return getBestBorrowAsset() }
  getNeverlandTVL():    Promise<number>         { return getNeverlandTVL() }

  // ── Real-time ────────────────────────────────────────────────
  subscribeToSwaps(cb: (s: RealtimeSwap) => void, opts?: { protocols?: string[] }): () => void {
    return subscribeToSwaps(cb, opts)
  }
  subscribeToStaking(cb: (e: StakingEvent) => void): () => void {
    return subscribeToStaking(cb)
  }
  subscribeToNewBlocks(cb: (b: BlockInfo) => void): () => void {
    return subscribeToNewBlocks(cb)
  }

  // ── Aggregated ──────────────────────────────────────────────

  /**
   * Optimal yield strategy: compares aPriori staking vs best Neverland lending.
   */
  async getBestYieldStrategy(): Promise<YieldStrategy> {
    const [staking, bestLend] = await Promise.all([
      getStakingAPR(),
      getBestSupplyAsset(),
    ])

    if (staking.apr >= bestLend.supplyAPY) {
      return {
        type:        'staking',
        protocol:    'aPriori',
        asset:       'MON',
        apy:         staking.apr,
        risk:        'low',
        description: `Stake MON → aprMON via aPriori for ${(staking.apr * 100).toFixed(2)}% APR. TVL: ${(staking.tvl / 1e6).toFixed(1)}M MON.`,
      }
    }

    return {
      type:        'lending',
      protocol:    'Neverland',
      asset:       bestLend.asset,
      apy:         bestLend.supplyAPY,
      risk:        'low',
      description: `Supply ${bestLend.asset} to Neverland for ${(bestLend.supplyAPY * 100).toFixed(2)}% APY.`,
    }
  }

  /**
   * Full market snapshot — prices, staking, lending in one call.
   */
  async getMarketOverview(): Promise<MarketOverview> {
    const [priceResult, staking, lendingRates, pools] = await Promise.all([
      getTokenPrice('MON'),
      getStakingAPR(),
      getLendingRates(),
      getKuruPools(),
    ])

    return {
      monPrice:       priceResult.price,
      stakingAPR:     staking,
      topLendingRates: lendingRates
        .filter(r => r.supplyAPY > 0)
        .sort((a, b) => b.supplyAPY - a.supplyAPY)
        .slice(0, 5),
      topPools: pools.slice(0, 5),
      timestamp: Date.now(),
    }
  }

  /**
   * Compare yield across protocols.
   */
  async compareYields(): Promise<YieldComparison> {
    const staking = await getStakingAPR()
    return compareYields(staking)
  }

  // ── Phase 9: Multi-DEX Router ──────────────────────────────
  getBestSwapRoute(tIn: string, tOut: string, amt: number): Promise<RouterResult>  { return getBestSwapRoute(tIn, tOut, amt) }
  getAllSwapQuotes(tIn: string, tOut: string, amt: number): Promise<SwapRoute[]>   { return getAllSwapQuotes(tIn, tOut, amt) }
  detectDexArbitrage(tIn: string, tOut: string, amt: number, threshold?: number):
    Promise<{ buy: DexName; sell: DexName; spreadPct: number } | null>           { return detectDexArbitrage(tIn, tOut, amt, threshold) }

  // ── Phase 10: All LSTs ────────────────────────────────────
  getAllLSTStats():          Promise<LSTStats[]>  { return getAllLSTStats() }
  getBestLST():             Promise<LSTStats>    { return getBestLST() }
  compareLSTs():            Promise<{ best: LSTStats; all: LSTStats[]; totalTVL: number; reason: string }> { return compareLSTs() }
  getTotalStakedMON():      Promise<number>      { return getTotalStakedMON() }

  // ── Phase 11: Euler V2 ────────────────────────────────────
  getEulerVaults(max?: number): Promise<EulerVault[]> { return getEulerVaults(max) }
  getEulerBestSupply():         Promise<EulerVault>   { return getEulerBestSupply() }
  getEulerTVL():                Promise<number>       { return getEulerTVL() }

  // ── Phase 12: Oracle Aggregator ───────────────────────────
  getVerifiedPrice(token: string):       Promise<VerifiedPrice>  { return getVerifiedPrice(token) }
  getPrices(tokens: string[]):           Promise<VerifiedPrice[]> { return getPrices(tokens) }
  detectOracleDiscrepancy(token: string): Promise<{
    token: string; chainlinkPrice: number | null; pythPrice: number | null;
    dexPrice: number | null; maxDeviation: number; isDiscrepant: boolean
  }> { return detectOracleDiscrepancy(token) }

  // ── Phase 13: Wallet Portfolio ────────────────────────────
  getPortfolio(address: string):        Promise<Portfolio>       { return getPortfolio(address) }
  getPortfolioSummary(address: string): Promise<{
    address: string; totalUsd: number;
    breakdown: { category: string; usd: number; pct: number }[]
  }> { return getPortfolioSummary(address) }

  // ── Phase 14: Market Intelligence ────────────────────────
  getMonadMarketIntelligence():         Promise<MonadMarketOverview>     { return getMarketIntelligence() }
  getBestYields(limit?: number):        Promise<YieldOpportunity[]>      { return getTopYields(limit) }
  getMonadDeFiTVL():                    Promise<number>                  { return getMonadDeFiTVL() }
  getArbitrageAlerts():                 Promise<import('./aggregators/market').ArbitrageAlert[]> { return getArbitrageAlerts() }

  // ── Phase 15: Memecoins + Perps ───────────────────────────
  getNadFunTokens(limit?: number):      Promise<import('./protocols/nadfun').MemeToken[]>   { return getNadFunTokens(limit) }
  getTrendingMemes(limit?: number):     Promise<import('./protocols/nadfun').MemeToken[]>   { return getTrendingMemes(limit) }
  getPerpVaultStats():                  Promise<import('./protocols/perps').PerpVaultStats[]> { return getPerpVaultStats() }
  getFundingRates():                    Promise<{ protocol: string; asset: string; rate: number; fundingInterval: number }[]> { return getFundingRates() }
}
