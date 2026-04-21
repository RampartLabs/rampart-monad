// ============================================================
// Rampart SDK — Uniswap V2 on Monad Mainnet
// Verified: router 0x4b2ab38..., pairs exist (stale liquidity)
// ============================================================

import { publicClient } from '../../chain'
import { getToken } from './tokens'

const UNI_V2_ROUTER:  `0x${string}` = '0x4b2ab38dbf28d31d467aa8993f6c2585981d6804'
const PANCAKE_ROUTER: `0x${string}` = '0xb1bc24c34e88f7d43d5923034e3a14b24daacff9'

const ROUTER_ABI = [
  {
    name: 'getAmountsOut',
    type: 'function' as const,
    inputs:  [{ name: 'amountIn', type: 'uint256' }, { name: 'path', type: 'address[]' }],
    outputs: [{ name: 'amounts',  type: 'uint256[]' }],
    stateMutability: 'view' as const,
  },
] as const

export interface V2Quote {
  dex:       'uniswap-v2' | 'pancake-v2'
  amountOut: bigint
  amountOutHuman: number
  path:      string[]
}

async function getV2Quote(
  router: `0x${string}`,
  dex: 'uniswap-v2' | 'pancake-v2',
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
): Promise<V2Quote | null> {
  const tIn  = getToken(tokenIn)
  const tOut = getToken(tokenOut)
  try {
    const amounts = await publicClient.readContract({
      address:      router,
      abi:          ROUTER_ABI,
      functionName: 'getAmountsOut',
      args:         [amountIn, [tIn.address, tOut.address]],
    })
    const amountOut = amounts[1]
    return {
      dex,
      amountOut,
      amountOutHuman: Number(amountOut) / 10 ** tOut.decimals,
      path: [tIn.symbol, tOut.symbol],
    }
  } catch {
    return null
  }
}

export async function getUniswapV2Quote(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
): Promise<V2Quote | null> {
  return getV2Quote(UNI_V2_ROUTER, 'uniswap-v2', tokenIn, tokenOut, amountIn)
}

export async function getPancakeV2Quote(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
): Promise<V2Quote | null> {
  return getV2Quote(PANCAKE_ROUTER, 'pancake-v2', tokenIn, tokenOut, amountIn)
}
