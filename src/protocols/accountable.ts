/**
 * @module Accountable
 * @description Accountable Finance undercollateralized lending vaults on Monad.
 * Uses the ERC-7540 async vault standard for fixed-term and open-term lending pools
 * with verified institutional borrowers.
 *
 * **TVL:** ~$2M
 * **Type:** Undercollateralized Lending (ERC-7540)
 * **Docs:** https://accountable.capital
 *
 * Available functions:
 * - {@link getAccountableVaults} — all fixed-term and open-term lending vaults
 * - {@link getAccountableTVL} — total USD in Accountable Finance vaults
 */

// ============================================================
// Rampart SDK — Accountable Finance on Monad
// Uncollateralized / undercollateralized lending via async ERC-7540 vaults.
// Source: github.com/monad-crypto/protocols/mainnet/accountable.jsonc
// ============================================================

import { publicClient } from '../chain'

export const ACCOUNTABLE_ADDRESSES = {
  FeeManager:         '0x4DE9B4d7b70d1680cD8E3A2C60717cBbe6014991' as `0x${string}`,
  AsyncVaultFactory:  '0xeE004AEF79cb14BF31BFbFB14346E01fB7e5a2e8' as `0x${string}`,
  RewardsFactory:     '0x1106a70223e98E2b1807bf3e12698aFe2C5693e6' as `0x${string}`,
  GlobalRegistry:     '0xf786154e56e5c88Ce984800dEa71B48EA4FFAbfE' as `0x${string}`,
  AccountableFixedTerm: '0xD0A53e724EA9CB041e30f0243E3c84bdea238Dfa' as `0x${string}`,
  AccountableOpenTerm:  '0x59B0b84371BB3261FAD538C512eFFFc414CC1725' as `0x${string}`,
  FixedTermFactory:   '0x8a5Caf00C3EB20aEC11Fc35C153a8601Cd127fEd' as `0x${string}`,
  OpenTermFactory:    '0x606556A6B544ecDcbf15aF73A63B67516dc16Ad7' as `0x${string}`,
} as const

const FACTORY_ABI = [
  {
    name: 'VaultCreated',
    type: 'event' as const,
    inputs: [
      { name: 'vault',    type: 'address', indexed: true  },
      { name: 'asset',    type: 'address', indexed: false },
      { name: 'manager',  type: 'address', indexed: false },
    ],
  },
  { name: 'vaultCount', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'getVault',   type: 'function' as const, inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
] as const

const VAULT_ABI = [
  { name: 'totalAssets',     type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'totalSupply',     type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'asset',           type: 'function' as const, inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
  { name: 'name',            type: 'function' as const, inputs: [], outputs: [{ type: 'string' }],  stateMutability: 'view' as const },
  { name: 'totalPendingRedemptions', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
] as const

const ERC20_ABI = [
  { name: 'symbol',   type: 'function' as const, inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' as const },
  { name: 'decimals', type: 'function' as const, inputs: [], outputs: [{ type: 'uint8' }],  stateMutability: 'view' as const },
] as const

export interface AccountableVault {
  address:                string
  name:                   string
  asset:                  string
  assetSymbol:            string
  totalAssets:            number
  totalSupply:            number
  totalPendingRedemptions: number  // ERC-7540: assets queued for withdrawal
  tvlUSD:                 number
  vaultType:              'fixed-term' | 'open-term' | 'unknown'
  protocol:               'accountable'
}

async function discoverVaultsFromFactory(
  factoryAddr: `0x${string}`,
  vaultType: 'fixed-term' | 'open-term',
  maxVaults: number
): Promise<`0x${string}`[]> {
  // Try direct count/enumeration
  const count = await publicClient.readContract({
    address: factoryAddr, abi: FACTORY_ABI, functionName: 'vaultCount',
  }).catch(() => null)

  if (count !== null) {
    const n = Math.min(Number(count as bigint), maxVaults)
    const addrs = await Promise.allSettled(
      Array.from({ length: n }, (_, i) =>
        publicClient.readContract({ address: factoryAddr, abi: FACTORY_ABI, functionName: 'getVault', args: [BigInt(i)] })
      )
    )
    return addrs
      .filter((r): r is PromiseFulfilledResult<`0x${string}`> => r.status === 'fulfilled')
      .map(r => r.value)
  }

  // Fallback: scan events
  const blockNow  = await publicClient.getBlockNumber().catch(() => 0n)
  const fromBlock = blockNow > 100_000n ? blockNow - 100_000n : 0n
  const logs      = await publicClient.getLogs({
    address: factoryAddr, event: FACTORY_ABI[0], fromBlock, toBlock: blockNow,
  }).catch(() => [])

  return logs.map(l => l.args.vault as `0x${string}`).filter(Boolean).slice(0, maxVaults)
}

/**
 * Returns all Accountable Finance lending vaults on Monad.
 *
 * Discovers fixed-term and open-term ERC-7540 vaults via their factory contracts.
 * Falls back to event scanning if factory enumeration is unavailable.
 *
 * @param maxVaults - Maximum number of vaults to fetch per factory (default: 20)
 * @returns Array of {@link AccountableVault} objects with asset info, TVL, and vault type
 *
 * @example
 * ```typescript
 * const vaults = await getAccountableVaults(10)
 * // → [{ name: 'USDC Fixed 90d', vaultType: 'fixed-term', tvlUSD: 500000, ... }, ...]
 * ```
 *
 * @category Lending
 */
export async function getAccountableVaults(maxVaults = 20): Promise<AccountableVault[]> {
  const [fixedAddrs, openAddrs] = await Promise.all([
    discoverVaultsFromFactory(ACCOUNTABLE_ADDRESSES.FixedTermFactory, 'fixed-term', maxVaults),
    discoverVaultsFromFactory(ACCOUNTABLE_ADDRESSES.OpenTermFactory,  'open-term',  maxVaults),
  ])

  const allVaults = [
    ...fixedAddrs.map(a => ({ addr: a, vaultType: 'fixed-term' as const })),
    ...openAddrs.map(a => ({ addr: a, vaultType: 'open-term'  as const })),
  ]

  if (allVaults.length === 0) return []

  const results = await Promise.allSettled(
    allVaults.map(async ({ addr, vaultType }) => {
      const [totalAssetsRaw, totalSupplyRaw, assetAddrRaw, nameRaw, pendingRedemptionsRaw] = await Promise.allSettled([
        publicClient.readContract({ address: addr, abi: VAULT_ABI, functionName: 'totalAssets' }),
        publicClient.readContract({ address: addr, abi: VAULT_ABI, functionName: 'totalSupply' }),
        publicClient.readContract({ address: addr, abi: VAULT_ABI, functionName: 'asset' }),
        publicClient.readContract({ address: addr, abi: VAULT_ABI, functionName: 'name' }),
        publicClient.readContract({ address: addr, abi: VAULT_ABI, functionName: 'totalPendingRedemptions' }),
      ])

      const totalAssets            = totalAssetsRaw.status      === 'fulfilled' ? Number(totalAssetsRaw.value      as bigint) / 1e6 : 0
      const totalSupply            = totalSupplyRaw.status      === 'fulfilled' ? Number(totalSupplyRaw.value      as bigint) / 1e6 : 0
      const totalPendingRedemptions = pendingRedemptionsRaw.status === 'fulfilled' ? Number(pendingRedemptionsRaw.value as bigint) / 1e6 : 0
      const assetAddr              = assetAddrRaw.status        === 'fulfilled' ? (assetAddrRaw.value as string) : ''
      const name                   = nameRaw.status             === 'fulfilled' ? (nameRaw.value as string)       : addr.slice(0, 10)

      let assetSymbol = 'USDC'
      if (assetAddr) {
        const sym = await publicClient.readContract({ address: assetAddr as `0x${string}`, abi: ERC20_ABI, functionName: 'symbol' }).catch(() => null)
        if (sym) assetSymbol = sym as string
      }

      return {
        address: addr, name, asset: assetAddr, assetSymbol,
        totalAssets, totalSupply, totalPendingRedemptions,
        tvlUSD: totalAssets, vaultType,
        protocol: 'accountable' as const,
      } satisfies AccountableVault
    })
  )

  return results.flatMap(r => r.status === 'fulfilled' ? [r.value as AccountableVault] : [])
}

/**
 * Returns total Accountable Finance TVL on Monad in USD.
 *
 * Sums `totalAssets` across all discovered fixed-term and open-term vaults.
 *
 * @returns Total TVL in USD across all Accountable Finance vaults
 *
 * @example
 * ```typescript
 * const tvl = await getAccountableTVL()
 * // → 2100000
 * ```
 *
 * @category Lending
 */
export async function getAccountableTVL(): Promise<number> {
  const vaults = await getAccountableVaults()
  return vaults.reduce((s, v) => s + v.tvlUSD, 0)
}
