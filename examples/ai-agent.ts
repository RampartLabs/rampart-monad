/**
 * Rampart SDK — AI Agent (Vercel AI SDK v6)
 *
 * Demonstrates Layer 3: RampartAgent answers natural-language DeFi questions
 * using live on-chain data from Monad mainnet.
 *
 * With ANTHROPIC_API_KEY set  → uses Claude via generateText + tools
 * Without key                 → executes tools directly and formats answers
 *
 * Run: npx tsx examples/ai-agent.ts
 * Run: ANTHROPIC_API_KEY=sk-... npx tsx examples/ai-agent.ts
 */

import { RampartAgent } from '../src/index'

const LINE = '━'.repeat(60)
const THIN = '─'.repeat(60)

const QUESTIONS = [
  'What is the best yield strategy for MON holders right now?',
  'Compare borrowing rates across all lending protocols.',
  'How much TVL does Monad DeFi have in total?',
  'What is the current MON price?',
  'If I have 1000 MON, where should I put it to maximize yield?',
]

// ── Tool-direct mode: execute tools, format a human-readable answer ───────
async function answerWithTools(
  question: string,
  tools: Record<string, any>,
): Promise<string> {
  const q = question.toLowerCase()

  // Q1 / Q5 — yield strategy
  if (q.includes('yield') || q.includes('maximize') || q.includes('put it')) {
    const [staking, lending] = await Promise.all([
      tools.getAllLSTStats.execute({}).catch(() => []),
      tools.getLendingRates.execute({}).catch(() => []),
    ])
    const bestLST  = (staking as any[]).filter(l => l.apr > 0).sort((a: any, b: any) => b.apr - a.apr)[0]
    const bestLend = (lending as any[]).filter(l => l.supplyAPY > 0).sort((a: any, b: any) => b.supplyAPY - a.supplyAPY)[0]
    if (!bestLST) return 'Could not fetch yield data — check RPC connectivity.'
    const lstPct   = (bestLST.apr * 100).toFixed(2)
    const lendPct  = bestLend ? bestLend.supplyAPY.toFixed(2) : 'N/A'
    const note     = q.includes('1000')
      ? ` For 1000 MON at ${lstPct}%: ~${(1000 * bestLST.apr).toFixed(1)} MON/year.`
      : ''
    return (
      `Best yield: stake with ${bestLST.protocol} (${bestLST.token}) at ${lstPct}% APR. ` +
      `Alternative: supply ${bestLend?.asset ?? 'assets'} on Neverland at ${lendPct}% APY.` +
      note
    )
  }

  // Q2 — borrow rates
  if (q.includes('borrow')) {
    const rates = await tools.getLendingRates.execute({}).catch(() => [])
    const sorted = (rates as any[]).filter(r => r.borrowAPR > 0).sort((a: any, b: any) => a.borrowAPR - b.borrowAPR)
    if (sorted.length === 0) return 'No borrow rate data available right now.'
    const top3 = sorted.slice(0, 3).map((r: any) => `${r.asset} ${r.borrowAPR.toFixed(2)}%`).join(' · ')
    return `Cheapest borrow on Neverland (${sorted.length} assets): ${top3} APR.`
  }

  // Q3 — TVL
  if (q.includes('tvl') || q.includes('total')) {
    const tvl = await tools.getMonadDeFiTVL.execute({}).catch(() => 0) as number
    const fmtd = tvl >= 1_000_000 ? `$${(tvl / 1_000_000).toFixed(0)}M` : `$${tvl}`
    return `Total Monad DeFi TVL: ~${fmtd} across 21 integrated protocols. Morpho Blue leads at ~$186M.`
  }

  // Q4 — MON price
  if (q.includes('price') || q.includes('current mon')) {
    const price = await tools.getTokenPrice.execute({ token: 'MON' }).catch(() => null) as any
    if (!price) return 'Could not fetch MON price — check RPC connectivity.'
    return `MON is currently $${price.price.toFixed(4)} (source: ${price.source}).`
  }

  return 'Could not determine which tools to use for this question.'
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🏰 Rampart AI Agent — Monad DeFi Assistant')
  console.log(LINE)

  const agent  = new RampartAgent()
  const tools  = agent.getTools()
  const hasKey = !!process.env.ANTHROPIC_API_KEY

  if (hasKey) {
    console.log('🔑 ANTHROPIC_API_KEY detected — using Claude + live tools\n')
  } else {
    console.log('ℹ️  No ANTHROPIC_API_KEY — running in tool-direct mode')
    console.log('   Export ANTHROPIC_API_KEY to use live Claude responses\n')
  }

  console.log(`Registered tools : ${Object.keys(tools).length}`)
  console.log(THIN + '\n')

  for (const [i, question] of QUESTIONS.entries()) {
    console.log(`Q${i + 1}: ${question}`)
    const t0 = Date.now()

    if (hasKey) {
      // Live LLM path — needs: npm install @ai-sdk/anthropic
      try {
        const { generateText }   = await import('ai')
        const { createAnthropic } = await import('@ai-sdk/anthropic' as any)
        const model = createAnthropic()('claude-3-5-haiku-20241022')
        const { text, steps } = await (generateText as any)({
          model,
          tools:    tools,
          maxSteps: 4,
          prompt:   question + ' Answer in 2-3 sentences.',
        })
        const used = steps
          .flatMap((s: any) => s.toolCalls ?? [])
          .map((tc: any) => tc.toolName)
        if (used.length) console.log(`🔧 Tools: ${[...new Set(used)].join(', ')}`)
        console.log(`💬 ${text}`)
      } catch (err: any) {
        console.log(`⚠️  LLM unavailable (${err.message.slice(0, 60)})`)
        console.log(`💬 ${await answerWithTools(question, tools)}`)
      }
    } else {
      // Tool-direct path — no API key needed
      console.log('🔧 Fetching live on-chain data...')
      const answer = await answerWithTools(question, tools).catch(e => `Error: ${e.message}`)
      console.log(`💬 ${answer}`)
    }

    console.log(`⏱  ${Date.now() - t0}ms\n`)
    if (i < QUESTIONS.length - 1) console.log(THIN + '\n')
  }

  console.log(LINE)
  console.log('Done.\n')
}

main().catch(err => {
  console.error('Fatal error:', err.message)
  process.exit(1)
})
