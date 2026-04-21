/**
 * @module Enjoyoors
 * @description Enjoyoors — ERC4626 yield vaults on Monad. Depositors receive
 * yield-bearing shares whose exchange rate grows over time. APY is estimated by
 * comparing `convertToAssets` between the current block and ~1 hour ago
 * (7,200 blocks at ~400ms block time), then annualising the growth.
 *
 * **TVL:** ~$500K
 * **Type:** Yield Vaults
 * **Docs:** https://docs.enjoyoors.finance
 *
 * Available functions:
 * - {@link getEnjoyoorsVault} — single vault stats with live APY estimate
 * - {@link getEnjoyoorsVaults} — all vaults (currently wraps the single vault)
 * - {@link getEnjoyoorsTVL} — total vault TVL in USD
 */

// ============================================================
// Rampart SDK — Enjoyoors on Monad
// Yield vault protocol with ERC4626-style vaults on Monad.
// Source: github.com/monad-crypto/protocols/mainnet/enjoyoors.jsonc
// ============================================================

import { publicClient } from '../chain'

export const ENJOYOORS_ADDRESSES = {
  Vault: '0x6B5E332387e8beC98C52F10A72952B17176B4f1b' as `0x${string}`,
} as const

const VAULT_ABI = [
  { name: 'totalAssets',     type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'totalSupply',     type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'convertToAssets', type: 'function' as const, inputs: [{ name: 'shares', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'asset',           type: 'function' as const, inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
  { name: 'name',            type: 'function' as const, inputs: [], outputs: [{ type: 'string' }],  stateMutability: 'view' as const },
] as const

const ERC20_ABI = [
  { name: 'symbol',   type: 'function' as const, inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' as const },
  { name: 'decimals', type: 'function' as const, inputs: [], outputs: [{ type: 'uint8' }],  stateMutability: 'view' as const },
] as const

export interface EnjoyoorsVault {
  address:      string
  name:         string
  asset:        string
  totalAssets:  number
  totalSupply:  number
  exchangeRate: number
  tvlUSD:       number
  apy:          number
  protocol:     'enjoyoors'
}

/**
 * Returns live stats for the primary Enjoyoors vault on Monad.
 *
 * Fetches `totalAssets`, `totalSupply`, `asset`, `name`, and two
 * `convertToAssets` snapshots (current block and `currentBlock - 7200`)
 * in parallel. APY is estimated as hourly growth annualised (`× 24 × 365`).
 * Asset symbol and decimals are resolved from the underlying ERC-20.
 *
 * @returns {@link EnjoyoorsVault} with `totalAssets`, `totalSupply`, `exchangeRate`,
 *   `tvlUSD`, `apy`, and `protocol`.
 *
 * @example
 * ```typescript
 * const vault = await getEnjoyoorsVault()
 * // → { name: 'Enjoyoors MON Vault', asset: 'MON', tvlUSD: 500000, apy: 0.08, ... }
 * ```
 *
 * @category Yield
 */
export async function getEnjoyoorsVault(): Promise<EnjoyoorsVault> {
  const blockNow = await publicClient.getBlockNumber().catch(() => 0n)
  const DELTA    = 7_200n  // ~1 hour

  const [totalAssetsRaw, totalSupplyRaw, rateNow, ratePast, assetAddrRaw, nameRaw] = await Promise.allSettled([
    publicClient.readContract({ address: ENJOYOORS_ADDRESSES.Vault, abi: VAULT_ABI, functionName: 'totalAssets' }),
    publicClient.readContract({ address: ENJOYOORS_ADDRESSES.Vault, abi: VAULT_ABI, functionName: 'totalSupply' }),
    publicClient.readContract({ address: ENJOYOORS_ADDRESSES.Vault, abi: VAULT_ABI, functionName: 'convertToAssets', args: [1_000_000_000_000_000_000n] }),
    publicClient.readContract({ address: ENJOYOORS_ADDRESSES.Vault, abi: VAULT_ABI, functionName: 'convertToAssets', args: [1_000_000_000_000_000_000n], blockNumber: blockNow > DELTA ? blockNow - DELTA : 1n }),
    publicClient.readContract({ address: ENJOYOORS_ADDRESSES.Vault, abi: VAULT_ABI, functionName: 'asset' }),
    publicClient.readContract({ address: ENJOYOORS_ADDRESSES.Vault, abi: VAULT_ABI, functionName: 'name' }),
  ])

  const assetAddr = assetAddrRaw.status === 'fulfilled' ? (assetAddrRaw.value as string) : ''
  let assetSymbol = 'MON'
  let decimals    = 18
  if (assetAddr) {
    const [sym, dec] = await Promise.allSettled([
      publicClient.readContract({ address: assetAddr as `0x${string}`, abi: ERC20_ABI, functionName: 'symbol' }),
      publicClient.readContract({ address: assetAddr as `0x${string}`, abi: ERC20_ABI, functionName: 'decimals' }),
    ])
    if (sym.status === 'fulfilled') assetSymbol = sym.value as string
    if (dec.status === 'fulfilled') decimals    = Number(dec.value as number)
  }

  const totalAssets = totalAssetsRaw.status === 'fulfilled' ? Number(totalAssetsRaw.value as bigint) / (10 ** decimals) : 0
  const totalSupply = totalSupplyRaw.status === 'fulfilled' ? Number(totalSupplyRaw.value as bigint) / (10 ** decimals) : 0
  const r0          = rateNow.status  === 'fulfilled' ? Number(rateNow.value  as bigint) / 1e18 : 1
  const r1          = ratePast.status === 'fulfilled' ? Number(ratePast.value as bigint) / 1e18 : 1
  const name        = nameRaw.status  === 'fulfilled' ? (nameRaw.value as string) : 'Enjoyoors Vault'

  const growthPerHour = r1 > 0 ? (r0 - r1) / r1 : 0
  const apy           = Math.max(0, growthPerHour * 24 * 365)

  return {
    address: ENJOYOORS_ADDRESSES.Vault,
    name, asset: assetSymbol, totalAssets, totalSupply,
    exchangeRate: r0, tvlUSD: totalAssets, apy,
    protocol: 'enjoyoors',
  }
}

/**
 * Returns all Enjoyoors vaults on Monad as an array.
 *
 * Currently wraps {@link getEnjoyoorsVault} in an array. Extend this function
 * when additional vault addresses are known.
 *
 * @returns Array of {@link EnjoyoorsVault} objects.
 *
 * @example
 * ```typescript
 * const vaults = await getEnjoyoorsVaults()
 * // → [{ name: 'Enjoyoors MON Vault', tvlUSD: 500000, apy: 0.08, ... }]
 * ```
 *
 * @category Yield
 */
export async function getEnjoyoorsVaults(): Promise<EnjoyoorsVault[]> {
  const vault = await getEnjoyoorsVault()
  return [vault]
}

/**
 * Returns total Enjoyoors TVL on Monad in USD.
 *
 * Calls {@link getEnjoyoorsVault} and returns its `tvlUSD` field
 * (equal to `totalAssets` normalised to the underlying asset's decimals).
 *
 * @returns Total TVL as a float (USD).
 *
 * @example
 * ```typescript
 * const tvl = await getEnjoyoorsTVL()
 * // → 500000
 * ```
 *
 * @category Yield
 */
export async function getEnjoyoorsTVL(): Promise<number> {
  const vault = await getEnjoyoorsVault()
  return vault.tvlUSD
}
