/**
 * @module Beefy
 * @description Beefy Finance yield optimizer on Monad Mainnet. Beefy
 * auto-compounds LP and single-asset vault positions to maximise APY.
 * Vault and APY data are sourced from the public Beefy API
 * (`https://api.beefy.finance`); on-chain reads are used only when
 * API data is unavailable.
 *
 * **TVL:** ~$2M
 * **Type:** Yield Optimizer
 * **Docs:** https://docs.beefy.finance
 *
 * Available functions:
 * - {@link getBeefyVaults} — all Beefy vaults on Monad with live APY
 * - {@link getBeefyBestVault} — vault with the highest APY
 * - {@link getBeefyTVL} — total USD in all Beefy vaults
 */

// ============================================================
// Rampart SDK — Beefy Finance on Monad
// Yield optimizer — auto-compounds LP and vault positions
// VaultFactory: 0x9818dF1Bdce8D0E79B982e2C3a93ac821b3c17e0
// API: https://api.beefy.finance
// ============================================================

import { publicClient } from '../chain'

/**
 * Deployed Beefy contract addresses on Monad Mainnet.
 *
 * @category Yield
 */
export const BEEFY_ADDRESSES = {
  vaultFactory: '0x9818dF1Bdce8D0E79B982e2C3a93ac821b3c17e0' as `0x${string}`,
  clmFactory:   '0x03C2E2e84031d913d45B1F5b5dDC8E50Fcb28652' as `0x${string}`,
} as const

const BEEFY_API = 'https://api.beefy.finance'

// ERC4626-compatible vault ABI (Beefy vaults are ERC4626-like)
const VAULT_ABI = [
  { name: 'totalAssets',  type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'totalSupply',  type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'name',         type: 'function' as const, inputs: [], outputs: [{ type: 'string'  }], stateMutability: 'view' as const },
  { name: 'getPricePerFullShare', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
] as const

export interface BeefyVault {
  id:          string
  name:        string
  token:       string
  chain:       string
  apy:         number
  tvlUSD:      number
  status:      string
  platform:    string
  address:     string
}

/**
 * Fetch all Beefy Finance vaults on Monad with live APY and TVL.
 *
 * Calls three Beefy API endpoints in parallel — `/vaults`, `/apy`, and
 * `/tvl` — then joins them on vault ID. Only vaults where `chain === 'monad'`
 * (or `network === 'monad'`) are returned.
 *
 * @returns Array of Beefy vaults on Monad, empty when the API is unreachable
 *
 * @example
 * ```typescript
 * const vaults = await getBeefyVaults()
 * // → [{ id: 'beefy-mon-usdc', name: 'MON-USDC', apy: 0.45, tvlUSD: 120000, ... }]
 * ```
 *
 * @category Yield
 */
export async function getBeefyVaults(): Promise<BeefyVault[]> {
  const [vaultsData, apyData, tvlData] = await Promise.all([
    fetch(`${BEEFY_API}/vaults?chain=monad`).then(r => r.json()).catch(() => []),
    fetch(`${BEEFY_API}/apy`).then(r => r.json()).catch(() => ({})),
    fetch(`${BEEFY_API}/tvl`).then(r => r.json()).catch(() => ({})),
  ])

  if (!Array.isArray(vaultsData)) return []

  return vaultsData
    .filter((v: any) => v.chain === 'monad' || v.network === 'monad')
    .map((v: any) => ({
      id:       v.id ?? '',
      name:     v.name ?? v.id ?? '',
      token:    v.token ?? v.want ?? '',
      chain:    'monad',
      apy:      apyData[v.id] ?? 0,
      tvlUSD:   typeof tvlData[v.id] === 'object' ? (tvlData[v.id]?.monad ?? 0) : (tvlData[v.id] ?? 0),
      status:   v.status ?? 'active',
      platform: v.platform ?? '',
      address:  v.earnContractAddress ?? v.address ?? '',
    }))
}

/**
 * Return the active Beefy vault with the highest APY on Monad.
 *
 * Filters for `status === 'active'` before sorting, so retired or
 * paused vaults are excluded from consideration.
 *
 * @returns The top-APY vault, or `null` if no vaults are available
 *
 * @example
 * ```typescript
 * const best = await getBeefyBestVault()
 * // → { id: 'beefy-mon-usdc', apy: 0.45, tvlUSD: 120000, ... }
 * ```
 *
 * @category Yield
 */
export async function getBeefyBestVault(): Promise<BeefyVault | null> {
  const vaults = await getBeefyVaults()
  if (vaults.length === 0) return null
  return vaults.filter(v => v.status === 'active').sort((a, b) => b.apy - a.apy)[0] ?? null
}

/**
 * Return the total Beefy Finance TVL on Monad in USD.
 *
 * @returns Sum of `tvlUSD` across all Beefy vaults on Monad
 *
 * @example
 * ```typescript
 * const tvl = await getBeefyTVL()
 * // → 2000000
 * ```
 *
 * @category Yield
 */
export async function getBeefyTVL(): Promise<number> {
  const vaults = await getBeefyVaults()
  return vaults.reduce((sum, v) => sum + v.tvlUSD, 0)
}
