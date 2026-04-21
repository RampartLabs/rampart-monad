# Rampart Examples

Real-world examples showing how to use the Rampart SDK against live Monad mainnet data.

## Run an example

```bash
npx tsx examples/yield-finder.ts
npx tsx examples/portfolio-tracker.ts
npx tsx examples/market-overview.ts
npx tsx examples/ai-agent.ts
```

## Requirements

- Node.js 18+
- Dependencies already in `package.json` — run `npm install` once
- For `ai-agent.ts` with live Claude: set `ANTHROPIC_API_KEY` in `.env`
  and install the adapter: `npm install @ai-sdk/anthropic`

## What each example shows

| File | What it demonstrates |
|---|---|
| `yield-finder.ts` | Scans LSTs + lending + vaults, ranks all yields in one table |
| `portfolio-tracker.ts` | Full wallet snapshot: MON, tokens, LST positions, Euler lending |
| `market-overview.ts` | One-shot DeFi dashboard: price, TVL, best rates, arb alerts |
| `ai-agent.ts` | Natural language → on-chain data via 41 Vercel AI SDK tools |

## Example output

### yield-finder.ts
```
🏰 Rampart — Yield Finder
Fetching live data from Monad mainnet...

📊 Best Yield Opportunities Right Now:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 1. shMON (FastLane)           [LST]     15.40% APY
   2. aprMON (aPriori)           [LST]      9.64% APY
   3. gMON (Magma)               [LST]      5.00% APY
   4. WMON (Neverland)           [Lending]  4.20% APY
   5. USDC (Euler V2)            [Lending]  3.80% APY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total opportunities found : 12
Data fetched in           : 3241ms
```
