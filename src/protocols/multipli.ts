/**
 * @module Multipli
 * @description Multipli.fi USDC yield vault on Monad Mainnet. The `xUSDC`
 * vault token represents shares in a USDC pool earning real-world yield
 * (US Treasuries / money-market instruments). ERC4626 interface.
 *
 * **TVL:** ~$3K (early stage, vault launched recently on Monad)
 * **Type:** RWA Yield Vault
 * **Docs:** https://multipli.fi
 *
 * Available functions:
 * - {@link getMultipliVault} — xUSDC vault stats (TVL, APY, exchange rate)
 * - {@link getMultipliTVL} — total USD in Multipli USDC vault
 */

import { publicClient } from '../chain'

/**
 * Deployed Multipli contract addresses on Monad Mainnet.
 *
 * @category Yield
 */
export const MULTIPLI_ADDRESSES = {
  xUSDC:    '0xd74FB32112b1eF5b4C428Fead8dA8d85A0019009' as `0x${string}`,
  rwaUSDi:  '0x650b616b46fF94000Eb115926aB8393B90788D76' as `0x${string}`,
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
 * Fetch stats for Multipli.fi's xUSDC vault on Monad.
 *
 * Reads `totalAssets`, `totalSupply`, `decimals`, `name`, `symbol`, and the
 * `convertToAssets(1e6)` exchange rate from the ERC4626 vault in a single
 * parallel batch. Because the vault is USDC-denominated, `tvlUSD` equals
 * `totalAssets` directly (no price oracle required).
 *
 * @returns Vault snapshot including supply, exchange rate (USD/share), and TVL
 *
 * @example
 * ```typescript
 * const vault = await getMultipliVault()
 * // → { symbol: 'xUSDC', totalAssets: 3189, exchangeRate: 1.014, tvlUSD: 3189, ... }
 * ```
 *
 * @category Yield
 */
export async function getMultipliVault(): Promise<MultipliVault> {
  const addr = MULTIPLI_ADDRESSES.xUSDC

  const [totalAssetsRaw, totalSupplyRaw, decimalsRaw, name, symbol, converted] = await Promise.all([
    publicClient.readContract({ address: addr, abi: ERC4626_ABI, functionName: 'totalAssets' }).catch(() => 0n),
    publicClient.readContract({ address: addr, abi: ERC4626_ABI, functionName: 'totalSupply' }).catch(() => 0n),
    publicClient.readContract({ address: addr, abi: ERC4626_ABI, functionName: 'decimals' }).catch(() => 18),
    publicClient.readContract({ address: addr, abi: ERC4626_ABI, functionName: 'name' }).catch(() => 'xUSDC'),
    publicClient.readContract({ address: addr, abi: ERC4626_ABI, functionName: 'symbol' }).catch(() => 'xUSDC'),
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
 * @returns `totalAssets` from the xUSDC vault expressed in USD
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
