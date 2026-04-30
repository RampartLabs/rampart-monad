/**
 * @module Renzo
 * @description Renzo liquid restaking protocol on Monad Mainnet. Issues
 * `ezETH` — a yield-bearing token representing restaked ETH whose exchange
 * rate grows as staking and restaking rewards accrue. The vault follows the
 * ERC4626 interface.
 *
 * **TVL:** ~$3M
 * **Type:** Liquid Restaking
 * **Docs:** https://docs.renzoprotocol.com
 *
 * Available functions:
 * - {@link getRenzoStats} — ezETH supply, exchange rate, and USD TVL
 * - {@link getRenzoTVL} — total USD in Renzo ezETH vault
 */

// ============================================================
// Rampart SDK — Renzo Protocol on Monad
// Liquid restaking protocol (ezETH = restaked ETH)
// Docs: https://docs.renzoprotocol.com/docs/contracts/layer-2s/monad
// ============================================================

import { publicClient } from '../chain'
import { getVerifiedPrice } from './oracles'

const RENZO_EZ_ETH: `0x${string}` = '0x2416092f143378750bb29b79eD961ab195CcEea5'

const ERC4626_ABI = [
  { name: 'totalAssets',       type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'totalSupply',       type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'convertToAssets',   type: 'function' as const, inputs: [{ type: 'uint256', name: 'shares' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'decimals',          type: 'function' as const, inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' as const },
  { name: 'name',              type: 'function' as const, inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' as const },
  { name: 'symbol',            type: 'function' as const, inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' as const },
] as const

export interface RenzoStats {
  token:        string
  address:      string
  totalAssets:  number
  totalSupply:  number
  exchangeRate: number   // ezETH per ETH
  tvlUSD:       number
  protocol:     string
}

/**
 * Fetch stats for Renzo's ezETH liquid restaking token on Monad.
 *
 * Reads `totalAssets`, `totalSupply`, and the `convertToAssets(1e18)`
 * exchange rate from the ERC4626 vault, then multiplies total ETH assets
 * by the ETH/USD price from {@link getVerifiedPrice}.
 *
 * @returns Snapshot including supply, exchange rate, TVL in USD, and protocol tag
 *
 * @example
 * ```typescript
 * const stats = await getRenzoStats()
 * // → { token: 'ezETH', totalAssets: 1.5, exchangeRate: 1.05, tvlUSD: 2700, protocol: 'renzo' }
 * ```
 *
 * @category LST
 */
export async function getRenzoStats(): Promise<RenzoStats> {
  const [totalAssetsRaw, totalSupplyRaw, convertedRaw] = await Promise.all([
    publicClient.readContract({ address: RENZO_EZ_ETH, abi: ERC4626_ABI, functionName: 'totalAssets' }).catch(() => 0n),
    publicClient.readContract({ address: RENZO_EZ_ETH, abi: ERC4626_ABI, functionName: 'totalSupply' }).catch(() => 0n),
    publicClient.readContract({ address: RENZO_EZ_ETH, abi: ERC4626_ABI, functionName: 'convertToAssets', args: [BigInt(1e18)] }).catch(() => BigInt(1e18)),
  ])

  const totalAssets  = Number(totalAssetsRaw) / 1e18
  const totalSupply  = Number(totalSupplyRaw) / 1e18
  const exchangeRate = Number(convertedRaw) / 1e18

  // ETH price for USD TVL
  const ethPrice = await getVerifiedPrice('ETH').then(r => r.bestPrice)
  const tvlUSD   = totalAssets * ethPrice

  return {
    token:        'ezETH',
    address:      RENZO_EZ_ETH,
    totalAssets,
    totalSupply,
    exchangeRate,
    tvlUSD,
    protocol:     'renzo',
  }
}

/**
 * Return the total USD TVL of Renzo's ezETH vault on Monad.
 *
 * @returns USD value of all ezETH-backing ETH assets
 *
 * @example
 * ```typescript
 * const tvl = await getRenzoTVL()
 * // → 3000000
 * ```
 *
 * @category LST
 */
export async function getRenzoTVL(): Promise<number> {
  const stats = await getRenzoStats()
  return stats.tvlUSD
}

export { RENZO_EZ_ETH }
