/**
 * @module Lagoon
 * @description Lagoon Finance ERC-7540 async vault factory on Monad.
 * Vaults use async deposit/redeem (`requestDeposit`/`requestRedeem`) with onchain capital allocation.
 *
 * **TVL:** ~$500K
 * **Type:** ERC-7540 Async Vault Factory
 * **Docs:** https://lagoon.finance
 *
 * Available functions:
 * - {@link getLagoonVaults} — all Lagoon ERC-7540 async vaults
 * - {@link getLagoonTVL} — total USD across all Lagoon vaults
 */

// ============================================================
// Rampart SDK — Lagoon Finance on Monad
// ERC-7540 async vault infrastructure — onchain capital allocator.
// Source: github.com/monad-crypto/protocols/mainnet/lagoon.jsonc
// ============================================================

import { publicClient } from '../chain'

export const LAGOON_ADDRESSES = {
  ProtocolRegistry: '0xBf994c358f939011595AB4216AC005147863f9D6' as `0x${string}`,
  VaultFactory:     '0xcCdC4d06cA12A29C47D5d105fED59a6D07E9cf70' as `0x${string}`,
} as const

// VaultFactory events to discover deployed vaults
const VAULT_FACTORY_ABI = [
  {
    name: 'VaultDeployed',
    type: 'event' as const,
    inputs: [
      { name: 'vault',    type: 'address', indexed: true  },
      { name: 'asset',    type: 'address', indexed: true  },
      { name: 'manager',  type: 'address', indexed: false },
    ],
  },
  { name: 'vaultCount', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'allVaults',  type: 'function' as const, inputs: [{ type: 'uint256', name: 'index' }], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
] as const

// ERC-7540 / ERC-4626 vault interface
const VAULT_ABI = [
  { name: 'totalAssets', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'totalSupply', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'asset',       type: 'function' as const, inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
  { name: 'name',        type: 'function' as const, inputs: [], outputs: [{ type: 'string' }],  stateMutability: 'view' as const },
  { name: 'symbol',      type: 'function' as const, inputs: [], outputs: [{ type: 'string' }],  stateMutability: 'view' as const },
  { name: 'decimals',    type: 'function' as const, inputs: [], outputs: [{ type: 'uint8' }],   stateMutability: 'view' as const },
] as const

const ERC20_ABI = [
  { name: 'symbol',   type: 'function' as const, inputs: [], outputs: [{ type: 'string' }],  stateMutability: 'view' as const },
  { name: 'decimals', type: 'function' as const, inputs: [], outputs: [{ type: 'uint8' }],   stateMutability: 'view' as const },
] as const

export interface LagoonVault {
  address:      string
  name:         string
  symbol:       string
  asset:        string
  assetSymbol:  string
  totalAssets:  number
  totalSupply:  number
  tvlUSD:       number
  protocol:     'lagoon'
}

/**
 * Discovers and returns all Lagoon Finance ERC-7540 async vaults deployed on Monad.
 *
 * @param maxVaults - Maximum number of vaults to enumerate from the factory (default 30)
 * @returns Array of {@link LagoonVault} with TVL, asset symbol, and share supply
 *
 * @example
 * ```typescript
 * const vaults = await getLagoonVaults(10)
 * // → [{ name: 'Lagoon USDC', symbol: 'lgUSDC', tvlUSD: 480000, assetSymbol: 'USDC', ... }]
 * ```
 *
 * @category Yield
 */
export async function getLagoonVaults(maxVaults = 30): Promise<LagoonVault[]> {
  // Try factory enumeration first
  const vaultCount = await publicClient.readContract({
    address: LAGOON_ADDRESSES.VaultFactory,
    abi: VAULT_FACTORY_ABI,
    functionName: 'vaultCount',
  }).catch(() => null)

  let vaultAddresses: `0x${string}`[] = []

  if (vaultCount !== null) {
    const count  = Number(vaultCount as bigint)
    const limit  = Math.min(count, maxVaults)
    const addrs  = await Promise.allSettled(
      Array.from({ length: limit }, (_, i) =>
        publicClient.readContract({
          address: LAGOON_ADDRESSES.VaultFactory,
          abi: VAULT_FACTORY_ABI,
          functionName: 'allVaults',
          args: [BigInt(i)],
        })
      )
    )
    vaultAddresses = addrs
      .filter((r): r is PromiseFulfilledResult<`0x${string}`> => r.status === 'fulfilled')
      .map(r => r.value)
  } else {
    // Fallback: scan VaultDeployed events in recent blocks
    const blockNow = await publicClient.getBlockNumber().catch(() => 0n)
    const fromBlock = blockNow > 50_000n ? blockNow - 50_000n : 0n

    const logs = await publicClient.getLogs({
      address: LAGOON_ADDRESSES.VaultFactory,
      event: VAULT_FACTORY_ABI[0],
      fromBlock,
      toBlock: blockNow,
    }).catch(() => [])

    vaultAddresses = logs
      .map(l => l.args.vault as `0x${string}`)
      .filter(Boolean)
      .slice(0, maxVaults)
  }

  if (vaultAddresses.length === 0) return []

  const results = await Promise.allSettled(
    vaultAddresses.map(async (addr) => {
      const [totalAssetsRaw, totalSupplyRaw, assetAddr, nameVal, symbolVal, decimalsVal] = await Promise.allSettled([
        publicClient.readContract({ address: addr, abi: VAULT_ABI, functionName: 'totalAssets' }),
        publicClient.readContract({ address: addr, abi: VAULT_ABI, functionName: 'totalSupply' }),
        publicClient.readContract({ address: addr, abi: VAULT_ABI, functionName: 'asset' }),
        publicClient.readContract({ address: addr, abi: VAULT_ABI, functionName: 'name' }),
        publicClient.readContract({ address: addr, abi: VAULT_ABI, functionName: 'symbol' }),
        publicClient.readContract({ address: addr, abi: VAULT_ABI, functionName: 'decimals' }),
      ])

      const decimals   = decimalsVal.status === 'fulfilled' ? Number(decimalsVal.value as number) : 18
      const divisor    = 10 ** decimals
      const totalAssets = totalAssetsRaw.status === 'fulfilled' ? Number(totalAssetsRaw.value as bigint) / divisor : 0
      const totalSupply = totalSupplyRaw.status === 'fulfilled' ? Number(totalSupplyRaw.value as bigint) / divisor : 0
      const asset       = assetAddr.status      === 'fulfilled' ? (assetAddr.value as string) : ''
      const name        = nameVal.status         === 'fulfilled' ? (nameVal.value as string)   : addr.slice(0, 10)
      const symbol      = symbolVal.status       === 'fulfilled' ? (symbolVal.value as string) : '?'

      // Best-effort asset symbol lookup
      let assetSymbol = 'USDC'
      if (asset) {
        const asym = await publicClient.readContract({ address: asset as `0x${string}`, abi: ERC20_ABI, functionName: 'symbol' }).catch(() => null)
        if (asym) assetSymbol = asym as string
      }

      // Assume stablecoin TVL for now (1:1 USD)
      return {
        address: addr, name, symbol, asset, assetSymbol,
        totalAssets, totalSupply, tvlUSD: totalAssets,
        protocol: 'lagoon' as const,
      } satisfies LagoonVault
    })
  )

  return results.flatMap(r => r.status === 'fulfilled' ? [r.value as LagoonVault] : [])
}

/**
 * Returns total Lagoon Finance TVL on Monad in USD across all deployed vaults.
 *
 * @returns TVL in USD (sum of all vault `tvlUSD` values, assuming stablecoin 1:1 peg)
 *
 * @example
 * ```typescript
 * const tvl = await getLagoonTVL()
 * // → 480000
 * ```
 *
 * @category Yield
 */
export async function getLagoonTVL(): Promise<number> {
  const vaults = await getLagoonVaults()
  return vaults.reduce((s, v) => s + v.tvlUSD, 0)
}
