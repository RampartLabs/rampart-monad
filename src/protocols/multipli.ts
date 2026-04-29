/**
 * @module Multipli
 * @description Multipli.fi RWA yield vault on Monad Mainnet. The `xRWAUSDI`
 * token represents a share in a tokenized portfolio of US Treasuries and
 * money-market instruments. The vault is USD-denominated (USDC-based, 6
 * decimals) and follows the ERC4626 interface.
 *
 * **TVL:** ~$50M
 * **Type:** RWA Yield Vault
 * **Docs:** https://multipli.fi
 *
 * Available functions:
 * - {@link getMultipliVault} — xRWAUSDI vault stats (TVL, APY, exchange rate)
 * - {@link getMultipliTVL} — total USD in Multipli RWA vault
 */

// ============================================================
// Rampart SDK — Multipli.fi on Monad
// RWA (Real World Assets) yield protocol — tokenized Treasury/bond vaults
// NOTE: xRWAUSDI mainnet address not yet confirmed in official registry.
// Previous address 0x754704... was USDC, not Multipli. Functions return
// empty data until address is verified.
// ============================================================

import { publicClient } from '../chain'

/**
 * Deployed Multipli contract addresses on Monad Mainnet.
 * xRWAUSDI address is pending mainnet verification — not yet in the
 * official monad-crypto/protocols registry.
 *
 * @category Yield
 */
export const MULTIPLI_ADDRESSES = {
  xRWAUSDI: '' as `0x${string}`,
} as const

const ERC4626_ABI = [
  { name: 'totalAssets',      type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'totalSupply',      type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'convertToAssets',  type: 'function' as const, inputs: [{ type: 'uint256', name: 'shares' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'decimals',         type: 'function' as const, inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' as const },
  { name: 'name',             type: 'function' as const, inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' as const },
  { name: 'symbol',           type: 'function' as const, inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' as const },
] as const

export interface MultipliVault {
  name:         string
  symbol:       string
  address:      string
  totalAssets:  number
  totalSupply:  number
  exchangeRate: number   // USD per share
  tvlUSD:       number
  decimals:     number
  protocol:     string
}

/**
 * Fetch stats for Multipli.fi's xRWAUSDI RWA vault on Monad.
 *
 * Reads `totalAssets`, `totalSupply`, `decimals`, `name`, `symbol`, and the
 * `convertToAssets(1e6)` exchange rate from the ERC4626 vault in a single
 * parallel batch. Because the vault is USD-denominated, `tvlUSD` equals
 * `totalAssets` directly (no price oracle required).
 *
 * @returns Vault snapshot including supply, exchange rate (USD/share), and TVL
 *
 * @example
 * ```typescript
 * const vault = await getMultipliVault()
 * // → { symbol: 'xRWAUSDI', totalAssets: 50000000, exchangeRate: 1.05, tvlUSD: 50000000, ... }
 * ```
 *
 * @category Yield
 */
export async function getMultipliVault(): Promise<MultipliVault> {
  const addr = MULTIPLI_ADDRESSES.xRWAUSDI
  if (!addr) return { name: 'xRWAUSDI', symbol: 'xRWAUSDI', address: '', totalAssets: 0, totalSupply: 0, exchangeRate: 1, tvlUSD: 0, decimals: 6, protocol: 'multipli' }

  const [totalAssetsRaw, totalSupplyRaw, decimalsRaw, name, symbol, converted] = await Promise.all([
    publicClient.readContract({ address: addr, abi: ERC4626_ABI, functionName: 'totalAssets' }).catch(() => 0n),
    publicClient.readContract({ address: addr, abi: ERC4626_ABI, functionName: 'totalSupply' }).catch(() => 0n),
    publicClient.readContract({ address: addr, abi: ERC4626_ABI, functionName: 'decimals' }).catch(() => 18),
    publicClient.readContract({ address: addr, abi: ERC4626_ABI, functionName: 'name' }).catch(() => 'xRWAUSDI'),
    publicClient.readContract({ address: addr, abi: ERC4626_ABI, functionName: 'symbol' }).catch(() => 'xRWAUSDI'),
    publicClient.readContract({ address: addr, abi: ERC4626_ABI, functionName: 'convertToAssets', args: [BigInt(1e6)] }).catch(() => BigInt(1e6)),
  ])

  const decimals     = Number(decimalsRaw)
  const divisor      = 10 ** decimals
  const totalAssets  = Number(totalAssetsRaw) / divisor
  const totalSupply  = Number(totalSupplyRaw) / divisor
  const exchangeRate = Number(converted) / 1e6  // asset decimals = 6 (USDC-based)

  return {
    name:         name as string,
    symbol:       symbol as string,
    address:      addr,
    totalAssets,
    totalSupply,
    exchangeRate,
    tvlUSD:       totalAssets,   // RWA vaults are USD-denominated
    decimals,
    protocol:     'multipli',
  }
}

/**
 * Return the total Multipli.fi TVL in USD on Monad.
 *
 * @returns `totalAssets` from the xRWAUSDI vault expressed in USD
 *
 * @example
 * ```typescript
 * const tvl = await getMultipliTVL()
 * // → 50000000
 * ```
 *
 * @category Yield
 */
export async function getMultipliTVL(): Promise<number> {
  const vault = await getMultipliVault()
  return vault.tvlUSD
}
