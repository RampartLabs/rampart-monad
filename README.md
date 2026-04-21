# Rampart

Monad AgentKit. Read every protocol with one import.

[![npm](https://img.shields.io/npm/v/rampart-monad)](https://www.npmjs.com/package/rampart-monad)
[![tests](https://img.shields.io/badge/tests-106%2F106-brightgreen)](#)
[![protocols](https://img.shields.io/badge/protocols-55+-blue)](#)
[![license](https://img.shields.io/badge/license-MIT-blue)](#)

## Install

```bash
npm install rampart-monad
```

Peer deps: `viem ^2` · `ai ^6` · `zod ^4`

## Why

Getting MON price without Rampart:

```typescript
const client = createPublicClient({ chain: monad, transport: http() })
const pool = await client.readContract({ address: KURU_REGISTRY, abi: [...] })
// 35 more lines of parsing, decimals, error handling...
```

With Rampart:

```typescript
import { getTokenPrice } from 'rampart-monad'
const { price } = await getTokenPrice('MON')
```

## Usage

### Layer 1 - Functions

```typescript
import {
  getTokenPrice,
  getAllLSTStats,
  getLendingRates,
  getPortfolio,
  getMarketOverview,
  getBestSwapRoute,
  getVerifiedPrice,
} from 'rampart-monad'

// Cross-validated price from 4 oracles + DEX
const { bestPrice } = await getVerifiedPrice('MON')
// { bestPrice: 0.031, confidence: 'high', sources: ['kuru', 'pyth'] }

// Best liquid staking APR across all LSTs
const best = await getBestLST()
// { token: 'shMON', protocol: 'FastLane', apr: 12.1 }

// Best swap route across 5 DEXes
const route = await getBestSwapRoute('USDC', 'MON', 100)
// { dex: 'kuru', amountOut: 282.4, priceImpact: 0.0012 }

// Full wallet snapshot
const portfolio = await getPortfolio('0x...')
// { nativeBalance, tokens, lstPositions, ... }
```

### Layer 2 - Class

```typescript
import { Rampart } from 'rampart-monad'

const r = new Rampart()

await r.getMarketOverview()
await r.getBestYieldStrategy()
await r.compareYields()
await r.detectDexArbitrage('MON')

// Real-time streams (400ms Monad blocks)
const stop = r.subscribeToSwaps(swap => console.log(swap))
const stop2 = r.subscribeToNewBlocks(block => console.log(block.number))
stop()
stop2()
```

### Layer 3 - AI Agent

```typescript
import { RampartAgent } from 'rampart-monad'
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'

const agent = new RampartAgent()

const { text } = await generateText({
  model: anthropic('claude-3-5-sonnet-20241022'),
  tools: agent.getTools(),
  maxSteps: 5,
  prompt: 'Best yield on Monad right now?',
})
// "shMON at 12.1% APR (FastLane), followed by aprMON at 9.6% (aPriori)..."
```

## Protocols

| Protocol | Category | TVL |
|---|---|---|
| Morpho Blue | Lending | $186.7M |
| Multipli.fi | RWA Yield | $50M |
| Neverland | Lending | $43.3M |
| Upshift | Yield | $40.2M |
| Uniswap V4 | DEX | $39.2M |
| Euler V2 | Lending | $29.2M |
| Curve Finance | AMM | $25.5M |
| Gearbox V3 | Lending | $19.7M |
| Curvance | Lending | $18.6M |
| FastLane (shMON) | LST | $15.3M |
| Balancer V3 | AMM | $10.3M |
| LFJ / Trader Joe | DEX | $5.3M |
| Kintsu (sMON) | LST | $4.4M |
| Renzo | Liquid Restaking | $3M |
| Monday Trade | DEX + Perps | $3.2M |
| PancakeSwap V3 | DEX | $3.3M |
| Uniswap V3 | DEX | $2.4M |
| Beefy | Yield | $2M |
| Magma (gMON) | LST | $1.7M |
| Kuru | CLOB | $1.1M |
| Perpl | Perps | $1.1M |
| WooFi | DEX | $134K |
| Clober V2 | CLOB | $143K |
| nad.fun | Launchpad | $125K |
| aPriori (aprMON) | LST | live |
| KyberSwap | Aggregator | live |
| iZiSwap | DEX | live |
| Bean Exchange | DEX | live |
| Sablier | Streaming | live |
| Covenant | CDP | live |
| Chainlink | Oracle | live |
| Pyth | Oracle | live |
| Redstone | Oracle | live |
| Chronicle | Oracle | live |
| Envio | Indexer | live |

$800M+ TVL covered across 55+ protocols on Monad mainnet.

## API Reference

### Prices

```typescript
getVerifiedPrice(token)        // median from 4 oracles + DEX
getPrices(tokens[])            // batch prices
getLSTRatios()                 // gMON/shMON/sMON/aprMON exchange rates
detectOracleDiscrepancy(token) // flags price gaps across sources
```

### DEX

```typescript
getTokenPrice(token)
getOrderbook(symbol, depth?)
simulateKuruSwap(tokenIn, tokenOut, amount)
getBestSwapRoute(from, to, amount)
getAllSwapQuotes(from, to, amount)
detectDexArbitrage(token)
```

### LST

```typescript
getAllLSTStats()
getBestLST()
compareLSTs()
getTotalStakedMON()
```

### Lending

```typescript
getLendingRates()
getBestSupplyAsset()
getEulerVaults()
getMorphoVaults()
getGearboxPools()
```

### Portfolio

```typescript
getPortfolio(address)
getNativeBalance(address)
getTokenBalances(address)
getLSTPositions(address)
getEulerPositions(address)
```

### Market

```typescript
getMarketOverview()
getBestYields()
getArbitrageAlerts()
compareAssetYields(asset)
```

### Perps

```typescript
getMondayMarkets()
getPerplMarkets()
getFundingRates()
getPerpVaultStats()
```

### Real-time

```typescript
subscribeToSwaps(callback)
subscribeToStaking(callback)
subscribeToNewBlocks(callback)
```

## Architecture

```
Layer 1: Functions     src/protocols/* - direct protocol reads
Layer 2: Rampart       src/client.ts - aggregated methods
Layer 3: RampartAgent  src/agent.ts - 41 AI tools (Vercel AI SDK)
```

Live data from Monad mainnet (ChainID 143, `https://rpc.monad.xyz`).

## Development

```bash
npm install
npm test        # 106 tests live against mainnet
npm run build   # ESM + CJS + DTS
npm run typecheck
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to add a new protocol.

## License

MIT © 2026