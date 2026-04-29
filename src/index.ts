// ============================================================
// Rampart SDK — Main Export
// Monad-Native AgentKit: npm install rampart-monad
// ============================================================

// Layer 1: Functions (to be filled as phases complete)
export { getTokenPrice, getKuruPools, getOrderbook, simulateKuruSwap } from './protocols/kuru'
export { getUniswapPools, getUniswapPrice, compareWithKuru } from './protocols/uniswap'
export { getStakingAPR, getAPrioriExchangeRate, getAPrioriTVL, getAPrioriStats } from './protocols/apriori'
export { getLendingRates, getBestSupplyAsset, getBestBorrowAsset, getNeverlandTVL, compareYields } from './protocols/neverland'
export { subscribeToSwaps, subscribeToStaking, subscribeToNewBlocks } from './realtime/envio'

// Phase 9 — Multi-DEX Router
export { getBestSwapRoute, getAllSwapQuotes, detectDexArbitrage } from './aggregators/router'
export { getToken, getTokenByAddress, TOKENS } from './protocols/dex/tokens'

// Phase 10 — All LSTs
export { getAllLSTStats, getBestLST, compareLSTs, getTotalStakedMON, getAPrioriLST, getMagmaLST, getFastLaneLST, getKintsuLST } from './protocols/staking'

// Phase 11 — Euler V2 Lending
export { getEulerVaults, getEulerBestSupply, getEulerTVL } from './protocols/euler'
export type { EulerVault } from './protocols/euler'

// Phase 12 — Oracle Aggregator (Phase 2: +Redstone +Chronicle +LST ratios)
export {
  getVerifiedPrice, getPrices, getChainlinkRawPrice, detectOracleDiscrepancy,
  getRedstonePrice, getChroniclePrice, getLSTRatios,
} from './protocols/oracles'
export type { OraclePrice, VerifiedPrice, LSTRatios } from './protocols/oracles'

// Phase 13 — Wallet Portfolio
export { getPortfolio, getPortfolioSummary, getNativeBalance, getTokenBalances, getLSTPositions, getEulerPositions } from './protocols/portfolio'
export type { TokenBalance, LSTPosition, EulerPosition, Portfolio } from './protocols/portfolio'

// Phase 14 — Market Intelligence
export { getMarketOverview, getBestYields, getMonadDeFiTVL, getArbitrageAlerts, compareAssetYields } from './aggregators/market'
export type { YieldOpportunity, ArbitrageAlert, MonadMarketOverview, TVLBreakdown, DexSummary, LendingSummary } from './aggregators/market'

// Phase 15 — Memecoins + Perps
export { getNadFunTokens, getTrendingMemes, getGraduatedMemes, getNadFunStats, NADFUN_ADDRESSES } from './protocols/nadfun'
export type { NadFunStats } from './protocols/nadfun'
export { getMondayMarkets, getPerplMarkets, getPerplTVL, getPerpVaultStats, getFundingRates, getTotalPerpTVL } from './protocols/perps'
export type { MemeToken } from './protocols/nadfun'
export type { PerpMarket, PerpVaultStats } from './protocols/perps'

// Phase 16 — Morpho Blue (MetaMorpho vaults)
export { getMorphoVaults, getMorphoTVL, getBestMorphoVault } from './protocols/morpho'
export type { MorphoVault } from './protocols/morpho'

// Phase 17 — Curve Finance
export { getCurvePools, getCurveTVL, getCurvePoolByCoins } from './protocols/curve'
export type { CurvePool } from './protocols/curve'

// Phase 18 — Balancer V3
export { getBalancerPools, getBalancerTVL } from './protocols/balancer'
export type { BalancerPool } from './protocols/balancer'

// Phase 19 — Gearbox V3
export { getGearboxPools, getGearboxTVL } from './protocols/gearbox'
export type { GearboxPool } from './protocols/gearbox'

// Phase 20 — Clober V2 DEX
export { getCloberBooks, getCloberBookById } from './protocols/clober'
export type { CloberBook } from './protocols/clober'

// Phase 21 — Upshift Yield Aggregator
export { getUpshiftVaults, getUpshiftTVL, getBestUpshiftVault } from './protocols/upshift'
export type { UpshiftVault } from './protocols/upshift'

// Phase 22 — PancakeSwap V3
export { getPancakeSwapPools, getPancakeSwapPrice, getPancakeSwapQuote, getPancakeSwapTopPairs, PANCAKE_ADDRESSES } from './protocols/pancakeswap'
export type { PancakeSwapPair, PancakeSwapQuote } from './protocols/pancakeswap'

// Phase 23 — LFJ (Trader Joe Liquidity Book)
export { getLFJPools, getLFJPrice, getLFJPriceByAddress, getLFJPairCount, getLFJPairsForTokens, LFJ_ADDRESSES } from './protocols/lfj'
export type { LFJPool, LFJQuote } from './protocols/lfj'

// Phase 24 — Curvance ($58.9M TVL lending)
export { getCurvanceMarkets, getCurvanceTVL, getCurvanceMarket, CURVANCE_ADDRESSES } from './protocols/curvance'
export type { CurvanceMarket } from './protocols/curvance'

// Phase 25 — Uniswap V4
export { getUniswapV4Pools, getUniswapV4PoolState, getUniswapV4Price, simulateUniswapV4Swap, computeV4PoolId, UNISWAP_V4_ADDRESSES } from './protocols/uniswap-v4'
export type { V4PoolKey, UniswapV4Pool, V4SwapSimulation } from './protocols/uniswap-v4'

// Phase 26 — Renzo (ezETH liquid restaking)
export { getRenzoStats, getRenzoTVL, RENZO_EZ_ETH } from './protocols/renzo'
export type { RenzoStats } from './protocols/renzo'

// Phase 27 — Beefy Finance (yield optimizer)
export { getBeefyVaults, getBeefyBestVault, getBeefyTVL, BEEFY_ADDRESSES } from './protocols/beefy'
export type { BeefyVault } from './protocols/beefy'

// Phase 28 — WooFi DEX (PMM)
export { getWooFiPools, getWooFiQuote, WOOFI_ADDRESSES } from './protocols/woofi'
export type { WooFiPool, WooFiQuote } from './protocols/woofi'

// Phase 29 — KyberSwap (DEX aggregator)
export { getKyberSwapQuote, getKyberSwapPrice, KYBERSWAP_ADDRESSES } from './protocols/kyberswap'
export type { KyberSwapQuote } from './protocols/kyberswap'

// Phase 30 — iZiSwap (concentrated liquidity DEX)
export { getIZiPools, getIZiStats, IZISWAP_ADDRESSES } from './protocols/iziswap'
export type { IZiPool } from './protocols/iziswap'

// Phase 31 — Bean Exchange (DLMM DEX)
export { getBeanPairs, getBeanPairCount, BEAN_ADDRESSES } from './protocols/bean'
export type { BeanPair } from './protocols/bean'

// Phase 32 — Sablier (token streaming)
export { getSablierStats, getSablierStream, getSablierStreamCount, SABLIER_ADDRESSES } from './protocols/sablier'
export type { SablierStats, SablierStream } from './protocols/sablier'

// Phase 33 — Covenant (CDP/structured products)
export { getCovenantStats, COVENANT_ADDRESSES } from './protocols/covenant'
export type { CovenantStats } from './protocols/covenant'

// Phase 34 — Multipli.fi (RWA yield vaults)
export { getMultipliVault, getMultipliTVL, MULTIPLI_ADDRESSES } from './protocols/multipli'
export type { MultipliVault } from './protocols/multipli'

// Phase 35 — Mellow Protocol (vshMON + MVT vault infra)
export { getMellowVaults, getMellowAPY, getVshMONRate, MELLOW_ADDRESSES } from './protocols/mellow'
export type { MellowVault } from './protocols/mellow'

// Phase 36 — Lagoon Finance (ERC-7540 async vault factory)
export { getLagoonVaults, getLagoonTVL, LAGOON_ADDRESSES } from './protocols/lagoon'
export type { LagoonVault } from './protocols/lagoon'

// Phase 37 — Folks Finance (cross-chain lending spokes)
export { getFolksMarkets, getFolksTVL, FOLKS_ADDRESSES } from './protocols/folks'
export type { FolksMarket } from './protocols/folks'

// Phase 39 — LeverUp (leveraged perps + LVUSD)
export { getLeverUpStats, getLeverUpMarkets, LEVERUP_ADDRESSES } from './protocols/leverup'
export type { LeverUpStats } from './protocols/leverup'

// Phase 40 — Sumer Money (Compound V2 fork lending)
export { getSumerMarkets, getSumerTVL, SUMER_ADDRESSES } from './protocols/sumer'
export type { SumerMarket } from './protocols/sumer'

// Phase 41 — Sherpa Finance (delta-neutral USDC vault)
export { getSherpaVaults, getSherpaVault, getSherpaAPY, getSherpaTVL, SHERPA_ADDRESSES } from './protocols/sherpa'
export type { SherpaVault } from './protocols/sherpa'

// Phase 42 — Accountable Finance (undercollateralized lending)
export { getAccountableVaults, getAccountableTVL, ACCOUNTABLE_ADDRESSES } from './protocols/accountable'
export type { AccountableVault } from './protocols/accountable'

// Phase 43 — Capricorn Finance (CL DEX, Uniswap V3 fork)
export { getCapricornPools, getCapricornPrice, CAPRICORN_ADDRESSES } from './protocols/capricorn'
export type { CapricornPool } from './protocols/capricorn'

// Phase 44 — OpenOcean (DEX aggregator)
export { getOpenOceanQuote, getOpenOceanPrice, isOpenOceanAvailable, OPENOCEAN_ADDRESSES } from './protocols/openocean'
export type { OpenOceanQuote } from './protocols/openocean'

// Phase 45 — Pingu Exchange (concentrated liquidity DEX)
export { getPinguStats, isPinguAvailable, PINGU_ADDRESSES } from './protocols/pingu'
export type { PinguStats } from './protocols/pingu'

// Phase 47 — Nabla Finance (single-sided AMM)
export { getNablaPools, getNablaTVL, NABLA_ADDRESSES } from './protocols/nabla'
export type { NablaPool } from './protocols/nabla'

// Phase 48 — TownSquare (cross-chain lending)
export { getTownSquareMarkets, getTownSquareTVL, TOWNSQUARE_ADDRESSES } from './protocols/townsquare'
export type { TownSquareMarket } from './protocols/townsquare'

// Phase 49 — Enjoyoors (yield vaults)
export { getEnjoyoorsVaults, getEnjoyoorsVault, getEnjoyoorsTVL, ENJOYOORS_ADDRESSES } from './protocols/enjoyoors'
export type { EnjoyoorsVault } from './protocols/enjoyoors'

// Phase 50 — Skate Finance (cross-chain intent execution)
export { getSkateStats, isSkateAvailable, SKATE_ADDRESSES } from './protocols/skate'
export type { SkateStats } from './protocols/skate'

// Phase 51 — Timeswap (fixed-maturity options/lending)
export { getTimeswapStats, isTimeswapAvailable, TIMESWAP_ADDRESSES } from './protocols/timeswap'
export type { TimeswapStats } from './protocols/timeswap'

// Phase 52 — Doppler (V4 token launchpad)
export { getDopplerStats, isDopplerAvailable, DOPPLER_ADDRESSES } from './protocols/doppler'
export type { DopplerStats } from './protocols/doppler'

// Layer 2: Class
export { Rampart } from './client'

// Layer 3: AI Agent
export { RampartAgent } from './agent'

// Types
export type {
  TokenPrice, StakingAPR, LendingRate, Pool, Orderbook,
  SwapSimulation, PriceComparison, YieldComparison, YieldStrategy,
  MarketOverview, NetworkStats, ValidatorStats, BlockInfo,
  RealtimeSwap, StakingEvent,
  // Phase 9
  DexName, SwapRoute, RouterResult,
  // Phase 10
  LSTStats,
} from './types'

// Chain config
export { publicClient, wsClient, monad, MONAD_CHAIN_ID, MONAD_BLOCK_TIME_MS } from './chain'
