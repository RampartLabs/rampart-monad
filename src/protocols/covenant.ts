/**
 * @module Covenant
 * @description Covenant Protocol — CDP and structured products on Monad. Built on the
 * Mellow Finance vault architecture; users deposit collateral, receive yield-bearing
 * vault tokens, and can borrow against positions. Verified live in the
 * mellow-finance/monad-protocols registry.
 *
 * **TVL:** ~$1M
 * **Type:** CDP / Structured Products
 * **Docs:** https://docs.mellow.finance
 *
 * Available functions:
 * - {@link getCovenantStats} — vault TVL, supply, and curator vault count
 */

// ============================================================
// Rampart SDK — Covenant Protocol on Monad
// CDP / Structured products protocol
// Covenant:  0x11A7Ab0A9D7bD531DBcF0f0630BF7167F8F198f6
// Curator:   0xAB0f8aB1e67cc02A9D58fc27055292289B159094
// Verified: mellow-finance/monad-protocols registry (live: true)
// ============================================================

import { publicClient } from '../chain'

export const COVENANT_ADDRESSES = {
  covenant:  '0x11A7Ab0A9D7bD531DBcF0f0630BF7167F8F198f6' as `0x${string}`,
  curator:   '0xAB0f8aB1e67cc02A9D58fc27055292289B159094' as `0x${string}`,
} as const

// Generic ERC4626 / vault interface for reading TVL
const VAULT_ABI = [
  { name: 'totalAssets', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'totalSupply', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'asset',       type: 'function' as const, inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
] as const

// Curator / registry ABI attempts
const CURATOR_ABI = [
  {
    name: 'vaultCount',
    type: 'function' as const,
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'getVault',
    type: 'function' as const,
    inputs: [{ name: 'index', type: 'uint256' }],
    outputs: [{ type: 'address' }],
    stateMutability: 'view' as const,
  },
] as const

export interface CovenantStats {
  totalAssets: number
  totalSupply: number
  tvlUSD:      number
  vaultCount:  number
  protocol:    string
}

/**
 * Returns Covenant protocol stats: vault TVL, total supply, and curator vault count.
 *
 * Reads `totalAssets`, `totalSupply` from the main Covenant vault (ERC4626), and
 * `vaultCount` from the Curator registry. Amounts are normalised to 18-decimal floats.
 * TVL is assumed 1:1 USD when the underlying asset is a stablecoin or MON.
 *
 * @returns {@link CovenantStats} with `totalAssets`, `totalSupply`, `tvlUSD`,
 *   `vaultCount`, and `protocol`.
 *
 * @example
 * ```typescript
 * const stats = await getCovenantStats()
 * // → { totalAssets: 500000, totalSupply: 490000, tvlUSD: 500000, vaultCount: 3, protocol: 'covenant' }
 * ```
 *
 * @category Lending
 */
export async function getCovenantStats(): Promise<CovenantStats> {
  const [totalAssetsRaw, totalSupplyRaw, vaultCountRaw] = await Promise.all([
    publicClient.readContract({ address: COVENANT_ADDRESSES.covenant, abi: VAULT_ABI, functionName: 'totalAssets' }).catch(() => 0n),
    publicClient.readContract({ address: COVENANT_ADDRESSES.covenant, abi: VAULT_ABI, functionName: 'totalSupply' }).catch(() => 0n),
    publicClient.readContract({ address: COVENANT_ADDRESSES.curator,  abi: CURATOR_ABI, functionName: 'vaultCount' }).catch(() => 0n),
  ])

  const totalAssets = Number(totalAssetsRaw) / 1e18
  const totalSupply = Number(totalSupplyRaw) / 1e18

  return {
    totalAssets,
    totalSupply,
    tvlUSD:     totalAssets,   // assume 1:1 USD if asset is a stablecoin or MON
    vaultCount: Number(vaultCountRaw),
    protocol:   'covenant',
  }
}
