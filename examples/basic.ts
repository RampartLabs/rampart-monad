/**
 * Rampart SDK — Basic Usage Example
 *
 * Demonstrates Layer 1 (raw functions) and Layer 2 (Rampart class).
 * Run:  npx ts-node examples/basic.ts
 *       OR: npx tsx examples/basic.ts
 */

import {
  // Layer 1 — raw protocol functions
  getTokenPrice,
  getStakingAPR,
  getLendingRates,
  getOrderbook,
  simulateKuruSwap,
  // Layer 2 — Rampart class
  Rampart,
} from '../src/index'

async function main() {
  console.log('=== Rampart SDK — Monad Mainnet DeFi ===\n')

  // ── Layer 1: raw functions ─────────────────────────────────────
  console.log('--- [Layer 1] Raw protocol calls ---')

  const monPrice = await getTokenPrice('MON')
  console.log(`MON price: $${monPrice.price.toFixed(4)} (source: ${monPrice.source})`)

  const staking = await getStakingAPR()
  console.log(`aPriori staking APR: ${(staking.apr * 100).toFixed(2)}%  TVL: ${staking.tvl.toLocaleString()} MON`)

  const rates = await getLendingRates()
  const bestSupply = rates.reduce((a, b) => (b.supplyAPY > a.supplyAPY ? b : a))
  console.log(`Best supply on Neverland: ${bestSupply.asset} @ ${(bestSupply.supplyAPY * 100).toFixed(2)}% APY`)

  const ob = await getOrderbook('MON_USDC')
  console.log(`MON/USDC mid: $${ob.midPrice.toFixed(4)}  spread: ${(ob.spread / ob.midPrice * 100).toFixed(3)}%`)

  const swap = await simulateKuruSwap('USDC', 'MON', 100)
  console.log(`Swap 100 USDC → ${swap.amountOut.toFixed(2)} MON (impact: ${(swap.priceImpact * 100).toFixed(3)}%)`)

  // ── Layer 2: Rampart class ──────────────────────────────────────
  console.log('\n--- [Layer 2] Rampart class ---')
  const r = new Rampart()

  const overview = await r.getMarketOverview()
  console.log(`Market snapshot at block ~${overview.timestamp}:`)
  console.log(`  MON: $${overview.monPrice.toFixed(4)}`)
  console.log(`  Staking APR: ${(overview.stakingAPR.apr * 100).toFixed(2)}%`)
  console.log(`  Top lending (${overview.topLendingRates[0].asset}): ${(overview.topLendingRates[0].supplyAPY * 100).toFixed(2)}%`)

  const strategy = await r.getBestYieldStrategy()
  console.log(`\nBest yield strategy right now:`)
  console.log(`  Type: ${strategy.type}`)
  console.log(`  Protocol: ${strategy.protocol}`)
  console.log(`  APY: ${(strategy.apy * 100).toFixed(2)}%`)
  console.log(`  Risk: ${strategy.risk}`)
  console.log(`  ${strategy.description}`)
}

main().catch(console.error)
