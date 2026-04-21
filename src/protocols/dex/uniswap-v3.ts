// ============================================================
// Rampart SDK — Uniswap V3 + PancakeSwap V3 on Monad Mainnet
// Quoter: 0x661e93ca... (Uniswap QuoterV2)
// PancakeSwap SmartRouter: 0x21114915...
// ============================================================

import { publicClient } from '../../chain'
import { getToken } from './tokens'

const UNI_V3_QUOTER:     `0x${string}` = '0x661e93cca42afacb172121ef892830ca3b70f08d'
const PANCAKE_V3_QUOTER: `0x${string}` = '0x9a550a522bbadfb69019b0432800ed17855a51c3'

// Standard V3 fee tiers
export const V3_FEE_TIERS = [100, 500, 2500, 3000, 10000] as const
export type FeeTier = (typeof V3_FEE_TIERS)[number]

const QUOTER_ABI = [
  {
    name: 'quoteExactInputSingle',
    type: 'function' as const,
    inputs: [{
      type: 'tuple',
      components: [
        { name: 'tokenIn',            type: 'address' },
        { name: 'tokenOut',           type: 'address' },
        { name: 'amountIn',           type: 'uint256' },
        { name: 'fee',                type: 'uint24'  },
        { name: 'sqrtPriceLimitX96',  type: 'uint160' },
      ],
    }],
    outputs: [
      { name: 'amountOut',             type: 'uint256' },
      { name: 'sqrtPriceX96After',     type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate',           type: 'uint256' },
    ],
    stateMutability: 'nonpayable' as const,
  },
] as const

export interface V3Quote {
  dex:            'uniswap-v3' | 'pancake-v3'
  fee:            FeeTier
  amountOut:      bigint
  amountOutHuman: number
  gasEstimate:    bigint
}

async function getBestV3Quote(
  quoter: `0x${string}`,
  dex: 'uniswap-v3' | 'pancake-v3',
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
): Promise<V3Quote | null> {
  const tIn  = getToken(tokenIn)
  const tOut = getToken(tokenOut)
  let best: V3Quote | null = null

  const results = await Promise.allSettled(
    V3_FEE_TIERS.map(fee =>
      publicClient.simulateContract({
        address:      quoter,
        abi:          QUOTER_ABI,
        functionName: 'quoteExactInputSingle',
        args: [{ tokenIn: tIn.address, tokenOut: tOut.address, amountIn, fee, sqrtPriceLimitX96: 0n }],
      }),
    ),
  )

  for (let i = 0; i < V3_FEE_TIERS.length; i++) {
    const r = results[i]
    if (r.status !== 'fulfilled') continue
    const [amountOut, , , gasEstimate] = r.value.result as [bigint, bigint, number, bigint]
    if (!best || amountOut > best.amountOut) {
      best = {
        dex,
        fee: V3_FEE_TIERS[i],
        amountOut,
        amountOutHuman: Number(amountOut) / 10 ** tOut.decimals,
        gasEstimate,
      }
    }
  }
  return best
}

export async function getUniswapV3Quote(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
): Promise<V3Quote | null> {
  return getBestV3Quote(UNI_V3_QUOTER, 'uniswap-v3', tokenIn, tokenOut, amountIn)
}

export async function getPancakeV3Quote(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
): Promise<V3Quote | null> {
  return getBestV3Quote(PANCAKE_V3_QUOTER, 'pancake-v3', tokenIn, tokenOut, amountIn)
}
