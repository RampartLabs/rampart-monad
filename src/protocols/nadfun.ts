/**
 * @module NadFun
 * @description nad.fun bonding-curve memecoin launchpad on Monad.
 * Tokens launch on a bonding curve and graduate to a full DEX once they hit the liquidity threshold.
 *
 * **TVL:** N/A
 * **Type:** Memecoin Launchpad
 * **Docs:** https://nad.fun
 *
 * Available functions:
 * - {@link getNadFunTokens} — all tokens launched on nad.fun
 * - {@link getTrendingMemes} — top meme tokens by bonding-curve liquidity
 * - {@link getGraduatedMemes} — tokens that graduated to a full DEX listing
 * - {@link getNadFunStats} — total tokens, graduated count, top tokens
 */

// ============================================================
// Rampart SDK — nad.fun Memecoin Launchpad on Monad
// Bonding-curve launchpad for Monad memecoins.
// Source: github.com/monad-crypto/protocols/mainnet/nad_fun.jsonc
// ============================================================

import { publicClient } from '../chain'

// Verified addresses from monad-crypto/protocols registry
export const NADFUN_ADDRESSES = {
  QUOTER_V3:            '0xAd8887348E5d5d479156c851F4F4778e83a1DFE3' as `0x${string}`,
  CREATOR_MANAGER:      '0x65fDa572628c1D3F55B9e9E66e6e8a61c53cfF7c' as `0x${string}`,
  TOKEN_REGISTRY:       '0x3Be9198208c198e2a4dab9A575764C8468DC83c6' as `0x${string}`,
  BONDING_CURVE_ROUTER: '0x6F6B8F1a20703309951a5127c45B49b1CD981A22' as `0x${string}`,
  BONDING_CURVE:        '0xA7283d07812a02AFB7C09B60f8896bCEA3F90aCE' as `0x${string}`,
  LP_MANAGER:           '0xAebe5522749b65eaE7b2A35c593145CC3128b515' as `0x${string}`,
  DEX_ROUTER:           '0x0B79d71AE99528D1dB24A4148b5f4F865cc2b137' as `0x${string}`,
  DEX_DEPLOYER:         '0x095ACd3d26DD09c8E26Ab864c8717a39fE61F320' as `0x${string}`,
  LENS:                 '0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea' as `0x${string}`,
  REWARD_POOL:          '0xD5eE94894f3C86952AF792e1a03B1699c08b8c73' as `0x${string}`,
} as const

// TOKEN_REGISTRY — common probe selectors for listing tokens
const TOKEN_REGISTRY_ABI = [
  { name: 'tokenCount',        type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'totalTokens',       type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'getTokenCount',     type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'getTokensByPage',   type: 'function' as const, inputs: [{ type: 'uint256', name: 'page' }, { type: 'uint256', name: 'size' }], outputs: [{ type: 'address[]' }], stateMutability: 'view' as const },
  { name: 'getTokenList',      type: 'function' as const, inputs: [{ type: 'uint256', name: 'start' }, { type: 'uint256', name: 'end' }], outputs: [{ type: 'address[]' }], stateMutability: 'view' as const },
  { name: 'getTokens',         type: 'function' as const, inputs: [{ type: 'uint256', name: 'offset' }, { type: 'uint256', name: 'limit' }], outputs: [{ type: 'address[]' }], stateMutability: 'view' as const },
  { name: 'getAllTokens',      type: 'function' as const, inputs: [], outputs: [{ type: 'address[]' }], stateMutability: 'view' as const },
] as const

// Bonding curve individual token ABI
const NADFUN_TOKEN_ABI = [
  { name: 'name',           type: 'function' as const, inputs: [], outputs: [{ type: 'string' }],  stateMutability: 'view' as const },
  { name: 'symbol',         type: 'function' as const, inputs: [], outputs: [{ type: 'string' }],  stateMutability: 'view' as const },
  { name: 'totalSupply',    type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'reserveMON',     type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'graduated',      type: 'function' as const, inputs: [], outputs: [{ type: 'bool' }],    stateMutability: 'view' as const },
  { name: 'creator',        type: 'function' as const, inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
  { name: 'graduationThreshold', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
] as const

// BONDING_CURVE ABI — global stats
const BONDING_CURVE_ABI = [
  { name: 'tokenCount',      type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'getTotalVolume',  type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'getTokens',       type: 'function' as const, inputs: [{ type: 'uint256' }, { type: 'uint256' }], outputs: [{ type: 'address[]' }], stateMutability: 'view' as const },
] as const

// CREATOR_MANAGER ABI — token creation registry
const CREATOR_MANAGER_ABI = [
  { name: 'tokenCount',    type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'totalCount',    type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'getTokenAt',    type: 'function' as const, inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
  { name: 'allTokens',     type: 'function' as const, inputs: [{ type: 'uint256' }, { type: 'uint256' }], outputs: [{ type: 'address[]' }], stateMutability: 'view' as const },
] as const

export interface MemeToken {
  address:             string
  name:                string
  symbol:              string
  totalSupply:         number
  priceMON:            number
  reserveMON:          number
  marketCapMON:        number
  graduated:           boolean
  creator:             string   // address that deployed the token
  graduationThreshold: number   // reserveMON needed to graduate (in MON)
  protocol:            'nadfun'
}

export interface NadFunStats {
  totalTokens:   number
  graduatedCount: number
  topTokens:     MemeToken[]
  protocol:      'nadfun'
}

async function getMemeTokenInfo(address: `0x${string}`): Promise<MemeToken | null> {
  try {
    const [name, symbol, totalSupply, reserveRaw, graduated, creatorRaw, thresholdRaw] = await Promise.allSettled([
      publicClient.readContract({ address, abi: NADFUN_TOKEN_ABI, functionName: 'name' }),
      publicClient.readContract({ address, abi: NADFUN_TOKEN_ABI, functionName: 'symbol' }),
      publicClient.readContract({ address, abi: NADFUN_TOKEN_ABI, functionName: 'totalSupply' }),
      publicClient.readContract({ address, abi: NADFUN_TOKEN_ABI, functionName: 'reserveMON' }),
      publicClient.readContract({ address, abi: NADFUN_TOKEN_ABI, functionName: 'graduated' }),
      publicClient.readContract({ address, abi: NADFUN_TOKEN_ABI, functionName: 'creator' }),
      publicClient.readContract({ address, abi: NADFUN_TOKEN_ABI, functionName: 'graduationThreshold' }),
    ])

    const nameVal      = name.status        === 'fulfilled' ? (name.value as string)        : 'Unknown'
    const symbolVal    = symbol.status      === 'fulfilled' ? (symbol.value as string)      : '???'
    const supplyRaw    = totalSupply.status === 'fulfilled' ? (totalSupply.value as bigint) : 0n
    const reserve      = reserveRaw.status  === 'fulfilled' ? (reserveRaw.value as bigint)  : 0n
    const graduatedVal = graduated.status   === 'fulfilled' ? (graduated.value as boolean)  : false
    const creatorVal   = creatorRaw.status  === 'fulfilled' ? (creatorRaw.value as string)  : ''
    const thresholdVal = thresholdRaw.status === 'fulfilled' ? Number(thresholdRaw.value as bigint) / 1e18 : 0

    const supply     = Number(supplyRaw) / 1e18
    const reserveMON = Number(reserve)   / 1e18
    const priceMON   = supply > 0 ? reserveMON / supply : 0

    return {
      address,
      name:                nameVal,
      symbol:              symbolVal,
      totalSupply:         supply,
      priceMON,
      reserveMON,
      marketCapMON:        priceMON * supply,
      graduated:           graduatedVal,
      creator:             creatorVal,
      graduationThreshold: thresholdVal,
      protocol:            'nadfun',
    }
  } catch {
    return null
  }
}

/** Probe TOKEN_REGISTRY for a token count — try multiple selector variations. */
async function probeTokenCount(): Promise<number> {
  const attempts = [
    () => publicClient.readContract({ address: NADFUN_ADDRESSES.TOKEN_REGISTRY,  abi: TOKEN_REGISTRY_ABI,   functionName: 'tokenCount' }),
    () => publicClient.readContract({ address: NADFUN_ADDRESSES.TOKEN_REGISTRY,  abi: TOKEN_REGISTRY_ABI,   functionName: 'totalTokens' }),
    () => publicClient.readContract({ address: NADFUN_ADDRESSES.TOKEN_REGISTRY,  abi: TOKEN_REGISTRY_ABI,   functionName: 'getTokenCount' }),
    () => publicClient.readContract({ address: NADFUN_ADDRESSES.CREATOR_MANAGER, abi: CREATOR_MANAGER_ABI,  functionName: 'tokenCount' }),
    () => publicClient.readContract({ address: NADFUN_ADDRESSES.CREATOR_MANAGER, abi: CREATOR_MANAGER_ABI,  functionName: 'totalCount' }),
    () => publicClient.readContract({ address: NADFUN_ADDRESSES.BONDING_CURVE,   abi: BONDING_CURVE_ABI,    functionName: 'tokenCount' }),
  ]
  for (const attempt of attempts) {
    const result = await attempt().catch(() => null)
    if (result !== null) return Number(result as bigint)
  }
  return 0
}

/** Probe TOKEN_REGISTRY for a paginated token list. */
async function probeTokenList(offset: number, limit: number): Promise<`0x${string}`[]> {
  const attempts: Array<() => Promise<`0x${string}`[]>> = [
    () => publicClient.readContract({ address: NADFUN_ADDRESSES.TOKEN_REGISTRY,  abi: TOKEN_REGISTRY_ABI,   functionName: 'getTokenList',    args: [BigInt(offset), BigInt(offset + limit)] }) as Promise<`0x${string}`[]>,
    () => publicClient.readContract({ address: NADFUN_ADDRESSES.TOKEN_REGISTRY,  abi: TOKEN_REGISTRY_ABI,   functionName: 'getTokens',       args: [BigInt(offset), BigInt(limit)] }) as Promise<`0x${string}`[]>,
    () => publicClient.readContract({ address: NADFUN_ADDRESSES.TOKEN_REGISTRY,  abi: TOKEN_REGISTRY_ABI,   functionName: 'getTokensByPage',  args: [BigInt(Math.floor(offset / limit)), BigInt(limit)] }) as Promise<`0x${string}`[]>,
    () => publicClient.readContract({ address: NADFUN_ADDRESSES.CREATOR_MANAGER, abi: CREATOR_MANAGER_ABI,  functionName: 'allTokens',       args: [BigInt(offset), BigInt(limit)] }) as Promise<`0x${string}`[]>,
    () => publicClient.readContract({ address: NADFUN_ADDRESSES.BONDING_CURVE,   abi: BONDING_CURVE_ABI,    functionName: 'getTokens',       args: [BigInt(offset), BigInt(offset + limit)] }) as Promise<`0x${string}`[]>,
  ]
  for (const attempt of attempts) {
    const result = await attempt().catch(() => null)
    if (result !== null && Array.isArray(result) && result.length > 0) return result
  }
  return []
}

/**
 * Returns the most recently launched memecoins from nad.fun, sorted by market cap.
 *
 * @param limit - Maximum number of tokens to return (default 20)
 * @returns Array of {@link MemeToken} sorted by `marketCapMON` descending
 *
 * @example
 * ```typescript
 * const tokens = await getNadFunTokens(10)
 * // → [{ address: '0x...', symbol: 'PEPE', marketCapMON: 42000, graduated: false, ... }]
 * ```
 *
 * @category Network
 */
export async function getNadFunTokens(limit = 20): Promise<MemeToken[]> {
  const total = await probeTokenCount()
  if (total === 0) return []

  const offset  = Math.max(0, total - limit)
  const addrs   = await probeTokenList(offset, limit)
  if (addrs.length === 0) return []

  const results = await Promise.allSettled(addrs.map(a => getMemeTokenInfo(a)))
  return results
    .filter((r): r is PromiseFulfilledResult<MemeToken> => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value)
    .sort((a, b) => b.marketCapMON - a.marketCapMON)
}

/**
 * Returns trending memecoins on nad.fun sorted by bonding-curve MON reserve (most traction).
 *
 * @param limit - Maximum number of tokens to return (default 10)
 * @returns Array of {@link MemeToken} sorted by `reserveMON` descending
 *
 * @example
 * ```typescript
 * const trending = await getTrendingMemes(5)
 * // → [{ symbol: 'DOGE2', reserveMON: 8500, ... }]
 * ```
 *
 * @category Network
 */
export async function getTrendingMemes(limit = 10): Promise<MemeToken[]> {
  const all = await getNadFunTokens(50)
  return all.sort((a, b) => b.reserveMON - a.reserveMON).slice(0, limit)
}

/**
 * Returns memecoins that have graduated from the bonding curve to live DEX trading.
 *
 * @returns Array of {@link MemeToken} where `graduated === true`
 *
 * @example
 * ```typescript
 * const graduated = await getGraduatedMemes()
 * // → [{ symbol: 'CHAD', graduated: true, ... }]
 * ```
 *
 * @category Network
 */
export async function getGraduatedMemes(): Promise<MemeToken[]> {
  const all = await getNadFunTokens(50)
  return all.filter(m => m.graduated)
}

/**
 * Returns aggregate stats for nad.fun: total tokens created, graduated count, and top tokens.
 *
 * @returns {@link NadFunStats} with total token count, graduated count, and top 5 tokens by market cap
 *
 * @example
 * ```typescript
 * const stats = await getNadFunStats()
 * // → { totalTokens: 1240, graduatedCount: 18, topTokens: [...], protocol: 'nadfun' }
 * ```
 *
 * @category Network
 */
export async function getNadFunStats(): Promise<NadFunStats> {
  const totalTokens = await probeTokenCount()
  const top = await getNadFunTokens(20)
  const graduatedCount = top.filter(t => t.graduated).length

  return {
    totalTokens,
    graduatedCount,
    topTokens:  top.slice(0, 5),
    protocol:   'nadfun',
  }
}
