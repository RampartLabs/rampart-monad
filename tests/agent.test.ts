import { describe, it, expect } from 'vitest'
import { RampartAgent } from '../src/agent'

const agent = new RampartAgent()

describe('RampartAgent (Layer 3)', () => {
  it('getTools returns all expected tool names', () => {
    const tools = agent.getTools()
    const names = Object.keys(tools)

    const expected = [
      'getTokenPrice', 'getKuruPools', 'getOrderbook', 'simulateKuruSwap',
      'getUniswapPools', 'getUniswapPrice', 'compareWithKuru',
      'getStakingAPR', 'getAPrioriExchangeRate', 'getAPrioriTVL', 'getAPrioriStats',
      'getLendingRates', 'getBestSupplyAsset', 'getBestBorrowAsset', 'getNeverlandTVL',
      'getBestYieldStrategy', 'getMarketOverview', 'compareYields',
    ]

    for (const name of expected) {
      expect(names).toContain(name)
    }
    console.log(`  Tools registered: ${names.length}`)
  })

  it('each tool has description, inputSchema and execute', () => {
    const tools = agent.getTools()
    for (const [name, t] of Object.entries(tools)) {
      expect((t as any).description, `${name} missing description`).toBeTruthy()
      // ai v6 uses inputSchema (not parameters)
      expect((t as any).inputSchema, `${name} missing inputSchema`).toBeTruthy()
      expect(typeof (t as any).execute, `${name} execute not a function`).toBe('function')
    }
  })

  it('getTokenPrice tool executes and returns live data', async () => {
    const tools = agent.getTools()
    const result = await (tools.getTokenPrice as any).execute({ token: 'MON' })
    expect(result.price).toBeGreaterThan(0)
    expect(result.token).toBe('MON')
    console.log(`  Tool result: MON = $${result.price}`)
  })

  it('getBestYieldStrategy tool executes end-to-end', async () => {
    const tools = agent.getTools()
    const strategy = await (tools.getBestYieldStrategy as any).execute({})
    expect(['staking', 'lending']).toContain(strategy.type)
    expect(strategy.apy).toBeGreaterThan(0)
    console.log(`  Tool result: best yield = ${strategy.type} @ ${(strategy.apy * 100).toFixed(2)}%`)
  })

  it('RampartAgent inherits Rampart class methods', () => {
    // Verify inheritance — all Rampart methods should be accessible
    expect(typeof agent.getTokenPrice).toBe('function')
    expect(typeof agent.getStakingAPR).toBe('function')
    expect(typeof agent.getLendingRates).toBe('function')
    expect(typeof agent.subscribeToSwaps).toBe('function')
    expect(typeof agent.getMarketOverview).toBe('function')
  })
})
