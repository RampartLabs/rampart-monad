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
import { getVerifiedPrice } from './oracles'

export const ENJOYOORS_ADDRESSES = {
  Vault:  '0x6B5E332387e8beC98C52F10A72952B17176B4f1b' as `0x${string}`,
} as const

const KNOWN_VAULT_ADDRESSES: `0x${string}`[] = [
  '0x6B5E332387e8beC98C52F10A72952B17176B4f1b',
]

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
  assetSymbol:  string
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
async function fetchEnjoyoorsVault(vaultAddr: `0x${string}`): Promise<EnjoyoorsVault> {
  const blockNow  = await publicClient.getBlockNumber().catch(() => 0n)
  const DELTA_1H  = 7_200n
  const DELTA_24H = 7_200n * 24n
  const DELTA_7D  = 7_200n * 168n

  const [totalAssetsRaw, totalSupplyRaw, rateNow, rate1hAgo, rate24hAgo, rate7dAgo, assetAddrRaw, nameRaw] = await Promise.allSettled([
    publicClient.readContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'totalAssets' }),
    publicClient.readContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'totalSupply' }),
    publicClient.readContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'convertToAssets', args: [1_000_000_000_000_000_000n] }),
    publicClient.readContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'convertToAssets', args: [1_000_000_000_000_000_000n], blockNumber: blockNow > DELTA_1H  ? blockNow - DELTA_1H  : 1n }),
    publicClient.readContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'convertToAssets', args: [1_000_000_000_000_000_000n], blockNumber: blockNow > DELTA_24H ? blockNow - DELTA_24H : 1n }),
    publicClient.readContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'convertToAssets', args: [1_000_000_000_000_000_000n], blockNumber: blockNow > DELTA_7D  ? blockNow - DELTA_7D  : 1n }),
    publicClient.readContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'asset' }),
    publicClient.readContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'name' }),
  ])

  const assetAddr = assetAddrRaw.status === 'fulfilled' ? (assetAddrRaw.value as string) : ''
  let assetSymbol = ''
  let decimals    = 18
  if (assetAddr) {
    const [sym, dec] = await Promise.allSettled([
      publicClient.readContract({ address: assetAddr as `0x${string}`, abi: ERC20_ABI, functionName: 'symbol' }),
      publicClient.readContract({ address: assetAddr as `0x${string}`, abi: ERC20_ABI, functionName: 'decimals' }),
    ])
    if (sym.status === 'fulfilled') assetSymbol = sym.value as string
    if (dec.status === 'fulfilled') decimals    = Number(dec.value as number)
  }

  const divisor     = 10n ** BigInt(decimals)
  const totalAssets = totalAssetsRaw.status === 'fulfilled' ? Number((totalAssetsRaw.value as bigint) * 1_000_000n / divisor) / 1_000_000 : 0
  const totalSupply = totalSupplyRaw.status === 'fulfilled' ? Number((totalSupplyRaw.value as bigint) * 1_000_000n / divisor) / 1_000_000 : 0
  const r0 = rateNow.status    === 'fulfilled' ? Number(rateNow.value    as bigint) / 1e18 : 1
  const r1 = rate1hAgo.status  === 'fulfilled' ? Number(rate1hAgo.value  as bigint) / 1e18 : 0
  const r2 = rate24hAgo.status === 'fulfilled' ? Number(rate24hAgo.value as bigint) / 1e18 : 0
  const r7 = rate7dAgo.status  === 'fulfilled' ? Number(rate7dAgo.value  as bigint) / 1e18 : 0
  const name = nameRaw.status === 'fulfilled' ? (nameRaw.value as string) : 'Enjoyoors Vault'

  const blocksPerYear = (365 * 24 * 3600 * 1000) / 400
  let apy = 0
  if (r1 > 0 && r0 !== r1) {
    apy = ((r0 - r1) / r1) * (blocksPerYear / Number(DELTA_1H))
  } else if (r2 > 0 && r0 !== r2) {
    apy = ((r0 - r2) / r2) * (blocksPerYear / Number(DELTA_24H))
  } else if (r7 > 0 && r0 !== r7) {
    apy = ((r0 - r7) / r7) * (blocksPerYear / Number(DELTA_7D))
  }

  const assetPrice = assetSymbol
    ? await getVerifiedPrice(assetSymbol).then(p => p.bestPrice).catch(() => 1)
    : 1
  const tvlUSD = totalAssets * assetPrice

  return {
    address: vaultAddr,
    name, asset: assetAddr || assetSymbol, assetSymbol, totalAssets, totalSupply,
    exchangeRate: r0, tvlUSD, apy,
    protocol: 'enjoyoors',
  }
}

export async function getEnjoyoorsVault(): Promise<EnjoyoorsVault> {
  return fetchEnjoyoorsVault(ENJOYOORS_ADDRESSES.Vault)
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
  const results = await Promise.allSettled(
    KNOWN_VAULT_ADDRESSES.map(addr => fetchEnjoyoorsVault(addr))
  )
  return results.flatMap(r => r.status === 'fulfilled' ? [r.value] : [])
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
  const vaults = await getEnjoyoorsVaults()
  return vaults.reduce((s, v) => s + v.tvlUSD, 0)
}
