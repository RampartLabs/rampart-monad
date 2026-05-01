# Changelog

All notable changes to `rampart-monad` will be documented here.

## [0.1.1] — 2026-05-01

### New Protocols
- **UltraYield by Edge Capital** (`src/protocols/ultrayield.ts`) — ERC-4626 vaults on Gearbox V3; `getUltraYieldVaults()`, `getUltraYieldAPY()`, `getUltraYieldTVL()`
- **Mu Digital** (`src/protocols/mudigital.ts`) — RWA structured credit (AZND senior, loAZND junior, muBOND fixed-rate); `getMuVaults()`, `getMuTVL()`

### Aggregation Updates
- **buildTVL** — includes UltraYield and Mu Digital vaults
- **Gearbox** — added AUSD + USDT0 pools to `getGearboxPools()`

### Test count
- **0.1.0**: 106 tests
- **0.1.1**: 106 tests (no regressions)

## [0.1.0] — 2026-04-20

### New Protocols — Section 2 (Phases 35–43, High Priority)
- **Mellow Protocol** (`src/protocols/mellow.ts`) — vshMON + MVT vault infra; `getMellowVaults()`, `getMellowAPY()`, `getVshMONRate()`
- **Lagoon Finance** (`src/protocols/lagoon.ts`) — ERC-7540 async vault factory; `getLagoonVaults()`, `getLagoonTVL()`
- **Folks Finance** (`src/protocols/folks.ts`) — cross-chain spoke token lending (8 markets); `getFolksMarkets()`, `getFolksTVL()`
- **Swaap Finance** (`src/protocols/swaap.ts`) — Balancer-style safeguard pools; `getSwaapPools()`, `getSwaapTVL()`
- **LeverUp** (`src/protocols/leverup.ts`) — leveraged perps + LVUSD stablecoin; `getLeverUpStats()`, `getLeverUpMarkets()`
- **Sumer Money** (`src/protocols/sumer.ts`) — Compound V2 fork lending; `getSumerMarkets()`, `getSumerTVL()`
- **Sherpa Finance** (`src/protocols/sherpa.ts`) — delta-neutral USDC vault; `getSherpaVault()`, `getSherpaAPY()`, `getSherpaTVL()`
- **Accountable Finance** (`src/protocols/accountable.ts`) — undercollateralized lending (fixed/open-term); `getAccountableVaults()`, `getAccountableTVL()`
- **Capricorn Finance** (`src/protocols/capricorn.ts`) — Uniswap V3 fork CL DEX; `getCapricornPools()`, `getCapricornPrice()`

### New Protocols — Section 3 (Phases 44–52, Medium Priority)
- **OpenOcean** (`src/protocols/openocean.ts`) — DEX aggregator, API-based quote routing; `getOpenOceanQuote()`, `getOpenOceanPrice()`
- **Pingu Exchange** (`src/protocols/pingu.ts`) — concentrated liquidity DEX; `getPinguStats()`
- **Purps** (`src/protocols/purps.ts`) — perp DEX with Factory enumeration; `getPurpsMarkets()`, `getPurpsTVL()`
- **Nabla Finance** (`src/protocols/nabla.ts`) — single-sided AMM with backstop pools; `getNablaPools()`, `getNablaTVL()`
- **TownSquare** (`src/protocols/townsquare.ts`) — cross-chain spoke/hub lending; `getTownSquareMarkets()`, `getTownSquareTVL()`
- **Enjoyoors** (`src/protocols/enjoyoors.ts`) — ERC4626 yield vaults; `getEnjoyoorsVaults()`, `getEnjoyoorsTVL()`
- **Skate Finance** (`src/protocols/skate.ts`) — cross-chain intent execution; `getSkateStats()`
- **Timeswap** (`src/protocols/timeswap.ts`) — fixed-maturity options/lending; `getTimeswapStats()`
- **Doppler** (`src/protocols/doppler.ts`) — Uniswap V4 token launchpad; `getDopplerStats()`

### LST Aggregation
- **vshMON** added to `getAllLSTStats()` — Mellow Fastlane vault (shMON wrapper)
- `LSTStats.token` union extended with `'vshMON'`

### Aggregation Updates
- **Router** (`getBestSwapRoute`) — added OpenOcean as 6th DEX source; `DexName` union extended with `'openocean'`
- **Market** (`getMarketOverview / buildTVL`) — TVL now includes Sherpa, Accountable, Folks, Sumer, Lagoon, Enjoyoors, Nabla, TownSquare

### Bug Fixes (TypeScript)
- Fixed `filter/map` type predicate pattern in `mellow.ts`, `lagoon.ts`, `folks.ts`, `accountable.ts`, `sumer.ts`, `swaap.ts` — changed to `flatMap`
- Fixed `capricorn.ts` QuoterV2 result cast via `unknown`
- Fixed `swaap.ts` `getPoolTokens` result cast via `unknown`

### Test count
- **0.3.0**: 106 tests
- **0.4.0**: 106 tests (no regressions; new protocols use graceful fallbacks)

## [0.3.0] — 2026-04-20

### Bug Fixes
- **Kuru price formula** — removed erroneous `* 10` from `decodePrice()`; MON now shows ~$0.031 ✓
- **Curvance TVL** — added missing `csAUSD` market (`0xAd4AA2a...`); +$14.5M, 12 markets total, TVL ~$33M

### New Protocols (Phases 26–34)
- **Renzo** (`src/protocols/renzo.ts`) — ezETH liquid restaking, ERC4626, TVL ~$3M
- **Beefy Finance** (`src/protocols/beefy.ts`) — yield optimizer, API-backed, TVL ~$2M
- **WooFi** (`src/protocols/woofi.ts`) — PMM DEX with oracle pricing (WooPPV2 + WooRouter)
- **KyberSwap** (`src/protocols/kyberswap.ts`) — DEX aggregator, HTTP API-based quote routing
- **iZiSwap** (`src/protocols/iziswap.ts`) — Discretized Liquidity AMM (CL DEX), 3 fee tiers
- **Bean Exchange** (`src/protocols/bean.ts`) — DLMM DEX (LFJ-like), Factory enumeration
- **Sablier** (`src/protocols/sablier.ts`) — token streaming protocol; stream count + active ratio
- **Covenant** (`src/protocols/covenant.ts`) — CDP/structured products; totalAssets on-chain
- **Multipli.fi** (`src/protocols/multipli.ts`) — RWA ERC4626 vault (xRWAUSDI), TVL ~$50M

### getMarketOverview() Upgrade
- New fields: `tvlBreakdown` (liquidStaking/lending/rwa/restaking/yieldOptimizer), `lstRatios`, `dex`, `lending`, `gasPrice`
- TVL now includes Morpho, Curvance, Renzo, Multipli, Beefy, Upshift
- `yields[]` extended with Morpho and Upshift vault entries
- New exported types: `TVLBreakdown`, `DexSummary`, `LendingSummary`

### JSDoc
- Added JSDoc to 23 exported functions across staking, morpho, curve, balancer, gearbox, clober, upshift, portfolio

### Test count
- **0.2.0**: 85 tests
- **0.3.0**: 106 tests (+21)

## [0.2.0] — 2026-04-20

### Phase 2 — Oracle Aggregation

- **Redstone oracle** — on-chain push feeds (Chainlink-compatible `latestAnswer()`)
  - Price feeds: MON, ETH, WETH, BTC, USDC (verified from monad-crypto/protocols)
  - HTTP gateway fallback for broader token coverage
  - `getRedstonePrice(token)` — exported function
- **Chronicle oracle** — on-chain MON/USD feed (`tryRead()`, WAD format)
  - `getChroniclePrice(token)` — exported function
- **LST ratio feeds** — unique to Monad, exclusively via Redstone push feeds
  - `getLSTRatios()` → `{ gMON, shMON, sMON, aprMON }` — cumulative exchange rates
  - On-chain addresses: gMON `0x8C9f...`, shMON `0xAd1A...`, sMON `0xE774...`, aprMON `0x0960...`
- **5-source oracle aggregation** — Chainlink + Pyth + Redstone + Chronicle + Kuru DEX
  - `getVerifiedPrice()` now returns **median** across all responding sources
  - Oracle-vs-DEX split detection (MON: oracles ~$0.031, Kuru ~$0.31 — flagged as warning)
  - `detectOracleDiscrepancy()` extended with `redstonePrice` + `chroniclePrice` fields

### Phase 3 — New Protocols

- **PancakeSwap V3** (`src/protocols/pancakeswap.ts`) — Uniswap V3 fork
  - Factory `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865`, QuoterV2 `0xB048Bbc1...`
  - 4 WMON/USDC pools active at fee tiers 100/500/2500/10000 bps
  - `getPancakeSwapPools()`, `getPancakeSwapPrice()`, `getPancakeSwapQuote()`, `getPancakeSwapTopPairs()`
- **LFJ / Trader Joe Liquidity Book** (`src/protocols/lfj.ts`)
  - LBFactory `0xb43120c4...` — 77 pairs deployed, 5 WMON/USDC bin configs
  - `getLFJPools()`, `getLFJPrice()`, `getLFJPairCount()`, `getLFJPairsForTokens()`
- **Curvance** (`src/protocols/curvance.ts`) — $18.6M TVL lending protocol
  - 11 cToken markets: caprMON, cWMON, cshMON, csMON, cUSDC, cWBTC, cWETH, cAUSD, cmuBOND, cezETH, cearnAUSD
  - `getCurvanceMarkets()`, `getCurvanceTVL()`, `getCurvanceMarket()`
- **Uniswap V4** (`src/protocols/uniswap-v4.ts`)
  - PoolManager `0x188d586d...`, V4Quoter `0xa222dd35...`
  - Active pools confirmed: native MON/USDC at fee=500 → $0.031
  - `getUniswapV4Pools()`, `getUniswapV4Price()`, `simulateUniswapV4Swap()`, `computeV4PoolId()`

### Fixes (Phase 1)
- `oracles.ts`: fixed 4 wrong Chainlink feed addresses (USDC, USDT, ETH, BTC)
  verified from monad-crypto/protocols/mainnet/chainlink.jsonc
- `portfolio.ts`: sMON `LST_ADDRESSES` → ERC20 token `0xe1d2439b...` (not vault `0xa3227c...`)

### Test count
- **0.1.0**: 66 tests
- **0.2.0**: 85 tests (+19)

## [0.1.0] — 2026-04-19

### Initial release

#### Protocols integrated (21)
- **Morpho Blue** — MetaMorpho vault discovery via factory events, ERC4626 APY
- **Neverland** — Aave V3 fork, 11 reserves, supply/borrow APY in ray units
- **Euler V2** — 108 vaults, APR from interestRate/1e27
- **Gearbox V3** — PoolV3 totalAssets/totalBorrowed/baseInterestRate
- **Upshift** — ERC4626 yield vaults (earnAUSD, Savings AUSD, WMON/AUSD, WBTC/AUSD)
- **Curve Finance** — MetaRegistry pool enumeration (pool_count, pool_list, get_pool_coins)
- **Balancer V3** — PoolCreated event discovery, getPoolTokens
- **FastLane (shMON)** — ERC4626 liquid staking
- **Kintsu (sMON)** — Custom proxy with convertToAssets(uint96) — non-standard selector
- **Magma (gMON)** — ERC4626, adaptive 500k-block delta for APR calculation
- **aPriori (aprMON)** — ERC4626 liquid staking vault
- **Kuru** — CLOB orderbook DEX, REST API, swap simulation
- **Uniswap V3** — Pool enumeration, price quotes
- **Monday Trade** — Uniswap V3 fork DEX (Factory/SwapRouter/QuoterV2)
- **Clober V2** — CLOB with computeBookId(keccak256) and Monad-specific policies
- **Perpl** — Perpetuals exchange, AUSD collateral TVL
- **nad.fun** — Memecoin launchpad, bonding curve factory scan
- **Chainlink + Pyth** — Cross-validated oracle prices with staleness detection
- **Envio** — WebSocket streams (swaps, staking, new blocks)
- **Multi-DEX Router** — Best swap route across 5 DEXes
- **Market Intelligence** — TVL aggregation, arb alerts, yield comparison

#### Architecture
- Layer 1: 72 exported functions
- Layer 2: `Rampart` class
- Layer 3: `RampartAgent` with 41 Vercel AI SDK v6 tools

#### Quality
- 66/66 tests passing live against Monad Mainnet (ChainID 143)
- Full TypeScript: ESM + CJS + DTS build (276KB)
- Zero mocking — all tests hit real RPC
