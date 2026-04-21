// ============================================================
// Rampart SDK — Layer 3: RampartAgent
// Vercel AI SDK v6 tools for LLM agent integration.
// ============================================================

import { tool } from 'ai'
import { z } from 'zod'
import { Rampart } from './client'

export class RampartAgent extends Rampart {
  /**
   * Returns all Rampart functions as Vercel AI SDK v6 tools.
   * Use with generateText / streamText from the 'ai' package.
   *
   * @example
   * import { generateText } from 'ai'
   * import { RampartAgent } from 'rampart-monad'
   * const agent = new RampartAgent()
   * const { text } = await generateText({
   *   model: yourModel,
   *   tools: agent.getTools(),
   *   prompt: 'What is the best yield strategy on Monad right now?',
   * })
   */
  getTools() {
    const self = this

    return {
      getTokenPrice: tool({
        description: 'Get current token price in USD from Kuru DEX on Monad. Returns price, source, and timestamp.',
        inputSchema: z.object({
          token: z.string().describe('Token symbol, e.g. "MON", "WBTC", "USDC"'),
          quote: z.string().optional().describe('Quote currency, defaults to USDC'),
        }),
        execute: async (input: { token: string; quote?: string }) =>
          self.getTokenPrice(input.token, input.quote),
      }),

      getKuruPools: tool({
        description: 'List all active trading pools on Kuru DEX (Monad native order-book DEX).',
        inputSchema: z.object({}),
        execute: async (_input: Record<string, never>) => self.getKuruPools(),
      }),

      getOrderbook: tool({
        description: 'Get full order book (bids/asks) for a Kuru trading pair.',
        inputSchema: z.object({
          symbol: z.string().describe('Trading pair, e.g. "MON_USDC", "WBTC_AUSD"'),
        }),
        execute: async (input: { symbol: string }) => self.getOrderbook(input.symbol),
      }),

      simulateKuruSwap: tool({
        description: 'Simulate a token swap on Kuru DEX — returns expected output amount and price impact.',
        inputSchema: z.object({
          tokenIn:  z.string().describe('Input token symbol, e.g. "MON"'),
          tokenOut: z.string().describe('Output token symbol, e.g. "USDC"'),
          amount:   z.number().positive().describe('Input amount in token units'),
        }),
        execute: async (input: { tokenIn: string; tokenOut: string; amount: number }) =>
          self.simulateKuruSwap(input.tokenIn, input.tokenOut, input.amount),
      }),

      getUniswapPools: tool({
        description: 'List Kuru DEX pools grouped by fee tier (Uniswap-compatible view).',
        inputSchema: z.object({}),
        execute: async (_input: Record<string, never>) => self.getUniswapPools(),
      }),

      getUniswapPrice: tool({
        description: 'Get token price via DEX aggregation (currently Kuru-based on Monad).',
        inputSchema: z.object({
          token: z.string().describe('Token symbol'),
        }),
        execute: async (input: { token: string }) => self.getUniswapPrice(input.token),
      }),

      compareWithKuru: tool({
        description: 'Compare token price between DEX sources. Identifies best price and spread.',
        inputSchema: z.object({
          token: z.string().describe('Token symbol to compare'),
        }),
        execute: async (input: { token: string }) => self.compareWithKuru(input.token),
      }),

      getStakingAPR: tool({
        description: 'Get aPriori liquid staking APR on Monad. MON → aprMON. Returns APR, TVL, exchange rate.',
        inputSchema: z.object({}),
        execute: async (_input: Record<string, never>) => self.getStakingAPR(),
      }),

      getAPrioriExchangeRate: tool({
        description: 'Get current aPriori exchange rate: how many MON does 1 aprMON redeem for.',
        inputSchema: z.object({}),
        execute: async (_input: Record<string, never>) => self.getAPrioriExchangeRate(),
      }),

      getAPrioriTVL: tool({
        description: 'Get total MON locked in aPriori staking vault.',
        inputSchema: z.object({}),
        execute: async (_input: Record<string, never>) => self.getAPrioriTVL(),
      }),

      getAPrioriStats: tool({
        description: 'Get all aPriori stats in one call: APR, TVL, and exchange rate.',
        inputSchema: z.object({}),
        execute: async (_input: Record<string, never>) => self.getAPrioriStats(),
      }),

      getLendingRates: tool({
        description: 'Get supply APY and borrow APR for all assets on Neverland (Aave V3 fork on Monad).',
        inputSchema: z.object({}),
        execute: async (_input: Record<string, never>) => self.getLendingRates(),
      }),

      getBestSupplyAsset: tool({
        description: 'Find the asset with the highest supply APY on Neverland lending protocol.',
        inputSchema: z.object({}),
        execute: async (_input: Record<string, never>) => self.getBestSupplyAsset(),
      }),

      getBestBorrowAsset: tool({
        description: 'Find the asset with the lowest borrow APR on Neverland lending protocol.',
        inputSchema: z.object({}),
        execute: async (_input: Record<string, never>) => self.getBestBorrowAsset(),
      }),

      getNeverlandTVL: tool({
        description: 'Get total value locked (TVL) in USD across all Neverland lending pools.',
        inputSchema: z.object({}),
        execute: async (_input: Record<string, never>) => self.getNeverlandTVL(),
      }),

      getBestYieldStrategy: tool({
        description: 'Compare aPriori staking vs Neverland lending and return the optimal yield strategy right now.',
        inputSchema: z.object({}),
        execute: async (_input: Record<string, never>) => self.getBestYieldStrategy(),
      }),

      getMarketOverview: tool({
        description: 'Full Monad DeFi snapshot: MON price, staking APR, top lending rates, top DEX pools.',
        inputSchema: z.object({}),
        execute: async (_input: Record<string, never>) => self.getMarketOverview(),
      }),

      compareYields: tool({
        description: 'Compare staking yield (aPriori) vs best lending yield (Neverland) with a recommendation.',
        inputSchema: z.object({}),
        execute: async (_input: Record<string, never>) => self.compareYields(),
      }),

      // ── Phase 9: Multi-DEX Router ─────────────────────────
      getBestSwapRoute: tool({
        description: 'Find the best swap route across all Monad DEXes (Kuru, UniV3, UniV2, PancakeV3, PancakeV2). Returns best price and all quotes.',
        inputSchema: z.object({
          tokenIn:  z.string().describe('Input token symbol, e.g. "WMON"'),
          tokenOut: z.string().describe('Output token symbol, e.g. "USDC"'),
          amount:   z.number().positive().describe('Input amount in token units'),
        }),
        execute: async (input: { tokenIn: string; tokenOut: string; amount: number }) =>
          self.getBestSwapRoute(input.tokenIn, input.tokenOut, input.amount),
      }),

      getAllSwapQuotes: tool({
        description: 'Get swap quotes from all DEXes simultaneously for comparison. Returns sorted list by output amount.',
        inputSchema: z.object({
          tokenIn:  z.string().describe('Input token symbol'),
          tokenOut: z.string().describe('Output token symbol'),
          amount:   z.number().positive().describe('Input amount'),
        }),
        execute: async (input: { tokenIn: string; tokenOut: string; amount: number }) =>
          self.getAllSwapQuotes(input.tokenIn, input.tokenOut, input.amount),
      }),

      detectDexArbitrage: tool({
        description: 'Detect arbitrage opportunities between DEXes. Returns spread % if opportunity exists above threshold.',
        inputSchema: z.object({
          tokenIn:   z.string().describe('Token to buy'),
          tokenOut:  z.string().describe('Token to sell'),
          amount:    z.number().positive().describe('Trade size'),
          threshold: z.number().optional().describe('Minimum spread % to flag, default 1%'),
        }),
        execute: async (input: { tokenIn: string; tokenOut: string; amount: number; threshold?: number }) =>
          self.detectDexArbitrage(input.tokenIn, input.tokenOut, input.amount, input.threshold),
      }),

      // ── Phase 10: All LSTs ──────────────────────────────────
      getAllLSTStats: tool({
        description: 'Get stats for all 4 Monad liquid staking tokens: aprMON (aPriori), gMON (Magma), shMON (FastLane), sMON (Kintsu). Returns APR, TVL, exchange rate.',
        inputSchema: z.object({}),
        execute: async (_input: Record<string, never>) => self.getAllLSTStats(),
      }),

      getBestLST: tool({
        description: 'Find the liquid staking token with the highest APR on Monad right now.',
        inputSchema: z.object({}),
        execute: async (_input: Record<string, never>) => self.getBestLST(),
      }),

      compareLSTs: tool({
        description: 'Compare all liquid staking options on Monad. Returns ranking, total TVL, and recommendation.',
        inputSchema: z.object({}),
        execute: async (_input: Record<string, never>) => self.compareLSTs(),
      }),

      getTotalStakedMON: tool({
        description: 'Get total MON staked across all 4 liquid staking protocols on Monad.',
        inputSchema: z.object({}),
        execute: async (_input: Record<string, never>) => self.getTotalStakedMON(),
      }),

      // ── Phase 11: Euler V2 ──────────────────────────────────
      getEulerVaults: tool({
        description: 'Get all active Euler V2 lending vaults on Monad with TVL, borrow APR, supply APY, and utilization.',
        inputSchema: z.object({
          maxVaults: z.number().int().optional().describe('Max vaults to scan, default 108'),
        }),
        execute: async (input: { maxVaults?: number }) => self.getEulerVaults(input.maxVaults),
      }),

      getEulerBestSupply: tool({
        description: 'Find the Euler V2 vault with the highest supply APY on Monad.',
        inputSchema: z.object({}),
        execute: async (_input: Record<string, never>) => self.getEulerBestSupply(),
      }),

      getEulerTVL: tool({
        description: 'Get total USD-denominated stable TVL locked in Euler V2 vaults on Monad.',
        inputSchema: z.object({}),
        execute: async (_input: Record<string, never>) => self.getEulerTVL(),
      }),

      // ── Phase 12: Oracle Aggregator ────────────────────────
      getVerifiedPrice: tool({
        description: 'Get token price cross-checked across Chainlink, Pyth, and Kuru DEX. Flags deviation > 1% and stale oracles.',
        inputSchema: z.object({
          token: z.string().describe('Token symbol, e.g. "MON", "ETH", "BTC"'),
        }),
        execute: async (input: { token: string }) => self.getVerifiedPrice(input.token),
      }),

      getPrices: tool({
        description: 'Get verified prices for multiple tokens at once.',
        inputSchema: z.object({
          tokens: z.array(z.string()).describe('Array of token symbols'),
        }),
        execute: async (input: { tokens: string[] }) => self.getPrices(input.tokens),
      }),

      detectOracleDiscrepancy: tool({
        description: 'Detect price discrepancy between Chainlink, Pyth, and DEX for a token. Important for MON: Chainlink is ~10x stale vs real price.',
        inputSchema: z.object({
          token: z.string().describe('Token symbol to check'),
        }),
        execute: async (input: { token: string }) => self.detectOracleDiscrepancy(input.token),
      }),

      // ── Phase 13: Wallet Portfolio ─────────────────────────
      getPortfolio: tool({
        description: 'Get complete DeFi portfolio for a wallet: native MON, ERC20 tokens, LST positions, Euler vault positions, total USD value.',
        inputSchema: z.object({
          address: z.string().describe('Wallet address (0x...)'),
        }),
        execute: async (input: { address: string }) => self.getPortfolio(input.address),
      }),

      getPortfolioSummary: tool({
        description: 'Get wallet portfolio summary with USD breakdown by category (native, stables, LSTs, lending).',
        inputSchema: z.object({
          address: z.string().describe('Wallet address (0x...)'),
        }),
        execute: async (input: { address: string }) => self.getPortfolioSummary(input.address),
      }),

      // ── Phase 14: Market Intelligence ──────────────────────
      getMonadMarketIntelligence: tool({
        description: 'Full Monad DeFi market intelligence: MON price, total TVL, best yields across all protocols, arbitrage alerts, LST comparison.',
        inputSchema: z.object({}),
        execute: async (_input: Record<string, never>) => self.getMonadMarketIntelligence(),
      }),

      getBestYields: tool({
        description: 'Get top yield opportunities across ALL Monad DeFi protocols (staking, lending, Euler). Ranked by APY.',
        inputSchema: z.object({
          limit: z.number().int().optional().describe('Number of results, default 10'),
        }),
        execute: async (input: { limit?: number }) => self.getBestYields(input.limit),
      }),

      getMonadDeFiTVL: tool({
        description: 'Get total USD TVL locked across all Monad DeFi protocols (LSTs + Euler + Neverland).',
        inputSchema: z.object({}),
        execute: async (_input: Record<string, never>) => self.getMonadDeFiTVL(),
      }),

      getArbitrageAlerts: tool({
        description: 'Scan for live cross-DEX arbitrage opportunities on Monad. Returns spread % for actionable pairs.',
        inputSchema: z.object({}),
        execute: async (_input: Record<string, never>) => self.getArbitrageAlerts(),
      }),

      // ── Phase 15: Memecoins + Perps ───────────────────────
      getNadFunTokens: tool({
        description: 'Get memecoins launched on nad.fun (Monad-native Pump.fun). Returns market cap, bonding curve reserve, graduation status.',
        inputSchema: z.object({
          limit: z.number().int().optional().describe('Max tokens to fetch, default 20'),
        }),
        execute: async (input: { limit?: number }) => self.getNadFunTokens(input.limit),
      }),

      getTrendingMemes: tool({
        description: 'Get trending memecoins on Monad by bonding curve reserve (most traction).',
        inputSchema: z.object({
          limit: z.number().int().optional().describe('Number of results, default 10'),
        }),
        execute: async (input: { limit?: number }) => self.getTrendingMemes(input.limit),
      }),

      getPerpVaultStats: tool({
        description: 'Get TVL and utilization for perpetual trading vaults on Monad (Monday Markets, Narwhal Finance).',
        inputSchema: z.object({}),
        execute: async (_input: Record<string, never>) => self.getPerpVaultStats(),
      }),

      getFundingRates: tool({
        description: 'Get current funding rates across perpetual markets on Monad. Useful for delta-neutral farming strategies.',
        inputSchema: z.object({}),
        execute: async (_input: Record<string, never>) => self.getFundingRates(),
      }),
    }
  }
}
