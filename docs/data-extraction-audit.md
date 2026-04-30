# Protocol Data Extraction Audit

> Generated: 2026-04-30. Tracks what each protocol currently extracts vs what's possible on-chain.

---

## LENDING

### Euler (`euler.ts`)
**Extracted:** vaultSymbol, assetSymbol, totalAssets, totalBorrows, utilizationRate, borrowAPR, supplyAPY, address
**TODO:**
- [ ] `interestFee()` — reserveFactor (protocol cut of interest)
- [ ] `LTV()` / `LTVFull()` — collateral factor per vault (liquidation threshold)
- [ ] `convertToAssets(1e18)` — ERC4626 exchange rate (share price)

### Morpho Blue + MetaMorpho (`morpho.ts`)
**Extracted:** name, symbol, assetSymbol, totalAssets, exchangeRate, supplyAPY, performanceFee, address
**TODO:**
- [ ] `supplyQueue()` — which underlying markets each MetaMorpho vault routes capital to
- [ ] `totalBorrows()` — not currently exposed per vault
- [ ] `curator()` — who manages allocation strategy

### Sumer (`sumer.ts`)
**Extracted:** symbol, asset, totalSupply, totalBorrows, supplyAPY, borrowAPY, tvlUSD
**TODO:**
- [ ] `borrowCaps(market)` — risk limit per market (in Comptroller)
- [ ] `closeFactorMantissa()` — what fraction can be liquidated per call
- [ ] `liquidationIncentiveMantissa()` — bonus paid to liquidator

### Curvance (`curvance.ts`)
**Extracted:** cToken, asset, totalAssets, totalBorrows, exchangeRate, totalAssetsUSD, supplyAPY, borrowAPR, utilization
**TODO:**
- [ ] `reserveFactor()` — protocol fee on interest
- [ ] `collateralCap()` — max collateral per market

### Gearbox (`gearbox.ts`)
**Extracted:** assetSymbol, totalAssets, totalBorrows, utilizationRate, borrowAPY, supplyAPY, address
**TODO:**
- [ ] `baseInterestRate()` — rate before utilization multiplier
- [ ] `withdrawFee()` — fee on withdrawals
- [ ] `creditManagersCount()` — number of active credit lines

### Covenant (`covenant.ts`)
**Extracted:** totalAssets, totalSupply, tvlUSD, vaultCount
**TODO:**
- [ ] `asset()` — underlying asset address (in ABI, not called)
- [ ] `name()`, `symbol()` — vault metadata (in ABI, not called)
- [ ] Per-vault breakdown: enumerate sub-vaults with individual TVL

### TownSquare (`townsquare.ts`)
**Extracted:** asset, totalDeposits, totalBorrows (=0), supplyAPY (=0), borrowAPY (=0), tvlUSD
**TODO:**
- [ ] `name()`, `symbol()` — pool token metadata (POOL_ABI has it, not returned)
- [ ] Interest rates from Hub contract
- [ ] `totalBorrows` from Hub directly

### Accountable (`accountable.ts`)
**Extracted:** name, asset, assetSymbol, totalAssets, totalSupply, tvlUSD, vaultType
**TODO:**
- [ ] `totalPendingRedemptions()` — ERC-7540 withdrawal queue depth
- [ ] Loan maturity date if fixed-term vault exposes it

### Folks Finance (`folks.ts`)
**Extracted:** symbol, spokeAddress, totalSupply, decimals, tvlUSD
**TODO:**
- [ ] `spokeChainId()` — cross-chain routing origin (SPOKE_COMMON_ABI has it, not called)
- [ ] Separate `totalBorrows` if Hub exposes borrow positions per spoke

---

## YIELD VAULTS

### Sherpa (`sherpa.ts`)
**Extracted:** totalAssets, totalSupply, exchangeRate, tvlUSD, apy
**TODO:**
- [ ] `asset()` — underlying token (assumed USDC, should verify on-chain)
- [ ] `decimals()` — for precision
- [ ] `name()`, `symbol()` — vault identity

### Enjoyoors (`enjoyoors.ts`)
**Extracted:** name, asset, totalAssets, totalSupply, exchangeRate, tvlUSD, apy
**TODO:**
- [ ] `decimals()` — currently hardcoded to 18, should be read
- [ ] Check if factory exists to enumerate more vaults

### Mellow (`mellow.ts`)
**Extracted:** name, symbol, totalAssets, totalSupply, exchangeRate, tvlUSD, underlying
**TODO:**
- [ ] `decimals()` — not queried
- [ ] Curator/operator address who controls the vault
- [ ] Min deposit, withdrawal lock if exposed

### Lagoon (`lagoon.ts`)
**Extracted:** name, symbol, asset, assetSymbol, totalAssets, totalSupply, tvlUSD
**TODO:**
- [ ] `decimals()` on vault token
- [ ] ERC-7540: `pendingDepositRequest()` / `pendingRedeemRequest()` — queue depth
- [ ] `manager()` — vault deployer/curator

### Beefy (`beefy.ts`)
**Extracted (API):** id, name, token, apy, tvlUSD, status, platform, address
**TODO:**
- [ ] On-chain fallback: `getPricePerFullShare()` if API is unavailable
- [ ] `totalSupply()` — on-chain vault share supply as sanity check

### Upshift (`upshift.ts`)
**Extracted:** name, symbol, assetSymbol, totalAssets, exchangeRate, apy
**TODO:**
- [ ] `totalBorrows()` — if underlying is a lending market
- [ ] `decimals()` — not queried
- [ ] `asset()` — underlying token address

### Renzo (`renzo.ts`)
**Extracted:** token, totalAssets, totalSupply, exchangeRate, tvlUSD
**TODO:**
- [ ] `decimals()` — hardcoded to 1e18
- [ ] `name()`, `symbol()` — hardcoded as 'ezETH'

---

## LST / STAKING

### aPriori (`apriori.ts`)
**Extracted:** apr, tvl, exchangeRate, timestamp (aprMON)
**TODO:**
- [ ] `totalSupply()` — total aprMON minted
- [ ] Pending withdrawal queue count if contract exposes it

### Staking aggregator (`staking.ts`)
**Extracted:** token, protocol, apr, tvl, exchangeRate, risk (all 4 LSTs: aprMON, gMON, shMON, sMON)
**TODO:**
- [ ] Unstaking duration — withdrawal delay per LST
- [ ] Validator count per LST provider

---

## DEX / AMM

### Curve (`curve.ts`)
**Extracted:** address, name, coins, coinDecimals, balances, fee, tvlUSD
**TODO:**
- [ ] `get_A(pool)` via MetaRegistry — amplification coefficient
- [ ] `admin_fee` — protocol fee ratio on top of swap fee
- [ ] `get_virtual_price(pool)` — pool health indicator

### Balancer (`balancer.ts`)
**Extracted:** address, type, tokens, balances, tvlUSD
**TODO:**
- [ ] `getNormalizedWeights()` — pool weight configuration (per-pool call)
- [ ] `getSwapFeePercentage()` — fee per pool (per-pool call)
- [ ] Pool ID: needed for accurate Vault queries

### LFJ / Trader Joe (`lfj.ts`)
**Extracted:** tokenX, tokenY, binStep, activeId, price, reserveX, reserveY, hasLiquidity
**TODO:**
- [ ] `getProtocolFees()` — accumulated protocol fees per pair
- [ ] `feeParameters()` — base fee + variable fee components
- [ ] LP fee APY estimate from fee/TVL ratio

### iZiSwap (`iziswap.ts`)
**Extracted:** tokenX, tokenY, fee, liquidity; total pool count
**TODO:**
- [ ] `state()` — currentPoint (tick) and current price
- [ ] Fee tier distribution across pools

### Capricorn (`capricorn.ts`)
**Extracted:** token0, token1, fee, liquidity; price via QuoterV2
**TODO:**
- [ ] `slot0()` — sqrtPriceX96, tick, unlocked status
- [ ] `feeGrowthGlobal0X128` / `feeGrowthGlobal1X128` — accrued fees

### Bean Exchange (`bean.ts`)
**Extracted:** tokenX, tokenY, reserveX, reserveY; pair count
**TODO:**
- [ ] Fee per pair
- [ ] Bin step / price range

### WooFi (`woofi.ts`)
**Extracted:** baseToken, quoteToken, reserve, feeRate; quote base→quote
**TODO:**
- [ ] `querySellQuote()` — reverse direction quote→base (in contract, not called)
- [ ] Volume if contract tracks cumulative

### PancakeSwap (`pancakeswap.ts`)
**Extracted:** token0, token1, fee, address; price + quote
**TODO:**
- [ ] `slot0()` — current tick and price per pool
- [ ] `liquidity()` — current active liquidity

### Clober (`clober.ts`)
**Extracted:** isOpened, isEmpty, fees per book
**TODO:**
- [ ] Order depth: bid/ask volume at price levels
- [ ] Open order count per book

### Uniswap V4 (`uniswap-v4.ts`)
**Extracted:** sqrtPriceX96, tick, liquidity, price; swap simulation
**TODO:**
- [ ] Hook address per pool — what custom logic is active
- [ ] LP positions via PositionManager

### Kuru (`kuru.ts`)
**Extracted (API):** price, pools with volume24h, fee; full orderbook; swap simulation
**TODO:**
- [ ] On-chain CLOB depth if contract exposes getter functions

### Pingu (`pingu.ts`)
**Extracted:** positionCount (minimal)
**TODO:**
- [ ] Pool enumeration: DataStore `getBytes32Count(POOL_LIST_KEY)` + `getBytes32ValuesAt`
- [ ] Token reserves per pool

### NadFun (`nadfun.ts`)
**Extracted:** name, symbol, totalSupply, priceMON, reserveMON, marketCapMON, graduated
**TODO:**
- [ ] Creator address per token
- [ ] Graduation threshold value (what reserveMON level triggers it)

### Doppler (`doppler.ts`)
**Extracted:** tokenCount (minimal)
**TODO:**
- [ ] Per-token: price curve, launch duration, V4 hook params
- [ ] Graduated tokens: which have moved to mainnet DEX

---

## PERPS / DERIVATIVES

### Perps — Monday + Perpl (`perps.ts`)
**Extracted:** longOI, shortOI, totalOI, fundingRate, maxLeverage, sentiment; tvl; vault stats
**TODO:**
- [ ] Mark price vs index price — premium/discount
- [ ] Recent liquidation events (log scan)
- [ ] Borrowing fee rate (separate from funding rate)

### LeverUp (`leverup.ts`)
**Extracted:** tvlUSD, longOI, shortOI, totalOI, lvusdSupply, lvmonSupply
**TODO:**
- [ ] LVUSD collateralization ratio: `tvlUSD / lvusdSupply`
- [ ] Insurance fund balance if contract exposes it

---

## INFRASTRUCTURE

### Timeswap (`timeswap.ts`)
**Extracted:** optionPairs, poolCount (minimal)
**TODO:**
- [ ] Per-pool: maturity date, TVL, utilization rate
- [ ] Option premium pricing per pair

### Sablier (`sablier.ts`)
**Extracted:** totalStreams, activeStreams (estimated), totalDeposited; full per-stream data
**TODO:**
- [ ] Group streams by asset token
- [ ] Accurate active stream count (not estimated)

### Skate (`skate.ts`)
**Extracted:** taskCount, messageCount (minimal)
**TODO:**
- [ ] Task state breakdown: pending vs completed vs failed
- [ ] Cross-chain message fees/costs

### Nabla (`nabla.ts`)
**Extracted:** address, name, asset, tvlUSD
**TODO:**
- [ ] `totalSupply()` — LP share tracking
- [ ] `backstopPool()` — backstop reserve amount
- [ ] Fee rate per pool

---

## PRIORITY FOR IMPLEMENTATION

| Priority | Protocol | What to add |
|----------|----------|-------------|
| HIGH | Sumer | borrowCap, closeFactor, liquidationIncentive |
| HIGH | Euler | reserveFactor, LTV per vault |
| HIGH | Curve | A coefficient, admin_fee, virtual price |
| HIGH | Balancer | weights per pool, swap fee per pool |
| HIGH | Covenant | asset(), name(), symbol() |
| HIGH | TownSquare | name/symbol from pool token |
| HIGH | WooFi | querySellQuote reverse direction |
| MID | LFJ | feeParameters, LP APY estimate |
| MID | Morpho | supplyQueue (underlying markets) |
| MID | LeverUp | collateralization ratio |
| MID | Accountable | ERC-7540 pending redemptions |
| MID | Capricorn | slot0 (current tick + price) |
| MID | Folks | spokeChainId |
| LOW | Beefy | on-chain APY fallback |
| LOW | Doppler | per-token launch details |
| LOW | Sablier | per-asset stream grouping |
