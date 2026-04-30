/**
 * @module LST
 * @description Liquid Staking Token aggregator for Monad mainnet.
 * Covers all four native LSTs (aprMON, gMON, shMON, sMON) plus the Mellow vshMON vault.
 * APR is derived from on-chain exchange-rate deltas over multiple block windows.
 *
 * **TVL:** ~500M MON combined (~$13M USD at current prices)
 * **Type:** Liquid Staking Aggregator
 * **Docs:** https://monad.xyz
 *
 * Available functions:
 * - {@link getAPrioriLST} — APR, TVL, and exchange rate for aprMON (aPriori)
 * - {@link getMagmaLST} — APR, TVL, and exchange rate for gMON (Magma)
 * - {@link getFastLaneLST} — APR, TVL, and exchange rate for shMON (FastLane)
 * - {@link getKintsuLST} — APR, TVL, and exchange rate for sMON (Kintsu, rebasing)
 * - {@link getAllLSTStats} — all 5 LSTs sorted by APR (aprMON, gMON, shMON, sMON, vshMON)
 * - {@link getBestLST} — LST with the highest current APR
 * - {@link compareLSTs} — full comparison with recommendation and total TVL
 * - {@link getTotalStakedMON} — total MON staked across all liquid staking protocols
 */

// ============================================================
// Rampart SDK — All LST Protocols (Phase 10)
// Verified on Monad Mainnet:
//   aprMON (aPriori):  ERC4626, rate=1.046, TVL=28.6M MON
//   gMON   (Magma):    ERC4626, rate=1.050, TVL=50.2M MON
//   shMON  (FastLane): ERC4626, rate=1.542, TVL=423M  MON
//   sMON   (Kintsu):   non-ERC4626, TVL via totalSupply, rate=~1.0 (rebasing)
// ============================================================

import { publicClient } from '../chain'
import { MONAD_BLOCKS_PER_YEAR } from '../chain'
import { getMellowVaults, getMellowAPY } from './mellow'

// ── Contract addresses ───────────────────────────────────────
const APRIORI_VAULT: `0x${string}` = '0x0c65A0BC65a5D819235B71F554D210D3F80E0852'
const MAGMA_VAULT:   `0x${string}` = '0x8498312a6b3cbd158bf0c93abdcf29e6e4f55081'
const SHMONAD_VAULT: `0x${string}` = '0x1b68626dca36c7fe922fd2d55e4f631d962de19c'
const KINTSU_TOKEN:  `0x${string}` = '0xa3227c5969757783154c60bf0bc1944180ed81b9'

// APR window: 72,000 blocks ≈ 8 hours at 400ms
const APR_BLOCK_DELTA = 72_000n

const ERC4626_ABI = [
  { name: 'totalAssets',     type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'convertToAssets', type: 'function' as const, inputs: [{ type: 'uint256', name: 'shares' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
] as const

// Kintsu sMON uses uint96 for convertToAssets — different 4-byte selector than standard ERC4626
const KINTSU_ABI = [
  { name: 'totalSupply',    type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'convertToAssets', type: 'function' as const, inputs: [{ type: 'uint96', name: 'shares' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
] as const

const ERC20_ABI = [
  { name: 'totalSupply', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
] as const

export interface LSTStats {
  token:           'aprMON' | 'sMON' | 'gMON' | 'shMON' | 'vshMON'
  protocol:        string
  contractAddress: string
  apr:             number     // annualised, e.g. 0.094 = 9.4%
  tvl:             number     // in MON
  exchangeRate:    number     // 1 LST = X MON
  risk:            'low' | 'medium' | 'high'
  timestamp:       number
}

// ── ERC4626 helpers ──────────────────────────────────────────

async function getERC4626Rate(vault: `0x${string}`): Promise<number> {
  const res = await publicClient.readContract({
    address: vault, abi: ERC4626_ABI,
    functionName: 'convertToAssets', args: [1_000_000_000_000_000_000n],
  })
  return Number(res) / 1e18
}

async function getERC4626TVL(vault: `0x${string}`): Promise<number> {
  const res = await publicClient.readContract({
    address: vault, abi: ERC4626_ABI, functionName: 'totalAssets',
  })
  return Number(res) / 1e18
}

async function calcERC4626APR(vault: `0x${string}`): Promise<number> {
  const blockNow = await publicClient.getBlockNumber()

  // Try multiple deltas: Magma updates ~every 500k blocks, so go large first
  const deltas = [500_000n, APR_BLOCK_DELTA, 7_200n, 1_800n]

  for (const delta of deltas) {
    if (blockNow < delta) continue
    const blockPast = blockNow - delta
    try {
      const [rateNow, ratePast] = await Promise.all([
        publicClient.readContract({ address: vault, abi: ERC4626_ABI, functionName: 'convertToAssets', args: [1_000_000_000_000_000_000n] }),
        publicClient.readContract({ address: vault, abi: ERC4626_ABI, functionName: 'convertToAssets', args: [1_000_000_000_000_000_000n], blockNumber: blockPast }),
      ])
      const rn = Number(rateNow)
      const rp = Number(ratePast)
      if (rp === 0 || rn === rp) continue  // no change yet — try smaller delta
      return ((rn - rp) / rp) * (MONAD_BLOCKS_PER_YEAR / Number(delta))
    } catch {
      continue
    }
  }
  return 0
}

// ── aPriori ──────────────────────────────────────────────────

/**
 * Returns current APR, TVL, and exchange rate for aPriori's aprMON liquid staking token.
 *
 * @returns LSTStats for aprMON including annualised APR, TVL in MON, and MON-per-aprMON exchange rate
 *
 * @example
 * ```typescript
 * const stats = await getAPrioriLST()
 * // → { token: 'aprMON', protocol: 'aPriori', apr: 0.094, tvl: 28600000, exchangeRate: 1.046 }  // tvl in MON
 * ```
 *
 * @category LST
 */
export async function getAPrioriLST(): Promise<LSTStats> {
  const [apr, tvl, rate] = await Promise.all([
    calcERC4626APR(APRIORI_VAULT),
    getERC4626TVL(APRIORI_VAULT),
    getERC4626Rate(APRIORI_VAULT),
  ])
  return { token: 'aprMON', protocol: 'aPriori', contractAddress: APRIORI_VAULT, apr, tvl, exchangeRate: rate, risk: 'low', timestamp: Date.now() }
}

// ── Magma ─────────────────────────────────────────────────────

/**
 * Returns current APR, TVL, and exchange rate for Magma's gMON liquid staking token.
 *
 * @returns LSTStats for gMON including annualised APR, TVL in MON, and MON-per-gMON exchange rate
 *
 * @example
 * ```typescript
 * const stats = await getMagmaLST()
 * // → { token: 'gMON', protocol: 'Magma', apr: 0.100, tvl: 50200000, exchangeRate: 1.050 }  // tvl in MON
 * ```
 *
 * @category LST
 */
export async function getMagmaLST(): Promise<LSTStats> {
  const [apr, tvl, rate] = await Promise.all([
    calcERC4626APR(MAGMA_VAULT),
    getERC4626TVL(MAGMA_VAULT),
    getERC4626Rate(MAGMA_VAULT),
  ])
  return { token: 'gMON', protocol: 'Magma', contractAddress: MAGMA_VAULT, apr, tvl, exchangeRate: rate, risk: 'low', timestamp: Date.now() }
}

// ── FastLane (shMON) ─────────────────────────────────────────

/**
 * Returns current APR, TVL, and exchange rate for FastLane's shMON liquid staking token.
 *
 * @returns LSTStats for shMON including annualised APR, TVL in MON, and MON-per-shMON exchange rate
 *
 * @example
 * ```typescript
 * const stats = await getFastLaneLST()
 * // → { token: 'shMON', protocol: 'FastLane', apr: 0.054, tvl: 423000000, exchangeRate: 1.542 }  // tvl in MON
 * ```
 *
 * @category LST
 */
export async function getFastLaneLST(): Promise<LSTStats> {
  const [apr, tvl, rate] = await Promise.all([
    calcERC4626APR(SHMONAD_VAULT),
    getERC4626TVL(SHMONAD_VAULT),
    getERC4626Rate(SHMONAD_VAULT),
  ])
  return { token: 'shMON', protocol: 'FastLane', contractAddress: SHMONAD_VAULT, apr, tvl, exchangeRate: rate, risk: 'medium', timestamp: Date.now() }
}

// ── Kintsu (sMON) — custom proxy vault (0xa3227...81b9)
// Verified: uses convertToAssets(uint96) — different selector than standard ERC4626 (uint256)
// 1e18 fits comfortably in uint96 (max ~7.9e28) so probe with 1_000_000_000_000_000_000n

/**
 * Returns current APR, TVL, and exchange rate for Kintsu's sMON rebasing liquid staking token.
 * Uses a non-standard uint96 convertToAssets() signature unique to Kintsu's proxy vault.
 *
 * @returns LSTStats for sMON including annualised APR, TVL in MON, and exchange rate
 *
 * @example
 * ```typescript
 * const stats = await getKintsuLST()
 * // → { token: 'sMON', protocol: 'Kintsu', apr: 0.089, tvl: 15000000, exchangeRate: 1.056 }  // tvl in MON
 * ```
 *
 * @category LST
 */
export async function getKintsuLST(): Promise<LSTStats> {
  const PROBE = 1_000_000_000_000_000_000n   // 1e18 — valid as uint96
  try {
    const [ts, rateRaw] = await Promise.all([
      publicClient.readContract({ address: KINTSU_TOKEN, abi: KINTSU_ABI, functionName: 'totalSupply' }),
      publicClient.readContract({ address: KINTSU_TOKEN, abi: KINTSU_ABI, functionName: 'convertToAssets', args: [PROBE] }).catch(() => null),
    ])
    const tvl  = Number(ts as bigint) / 1e18
    const rate = rateRaw !== null ? Number(rateRaw as bigint) / 1e18 : 1.0

    let apr = 0
    try {
      const blockNow = await publicClient.getBlockNumber()
      for (const delta of [500_000n, APR_BLOCK_DELTA, 7_200n]) {
        if (blockNow < delta) continue
        const [rn, rp] = await Promise.all([
          publicClient.readContract({ address: KINTSU_TOKEN, abi: KINTSU_ABI, functionName: 'convertToAssets', args: [PROBE] }),
          publicClient.readContract({ address: KINTSU_TOKEN, abi: KINTSU_ABI, functionName: 'convertToAssets', args: [PROBE], blockNumber: blockNow - delta }),
        ])
        const rateNow  = Number(rn as bigint)
        const ratePast = Number(rp as bigint)
        if (ratePast === 0 || rateNow === ratePast) continue
        apr = ((rateNow - ratePast) / ratePast) * (MONAD_BLOCKS_PER_YEAR / Number(delta))
        break
      }
    } catch { /* keep apr=0 */ }

    return { token: 'sMON', protocol: 'Kintsu', contractAddress: KINTSU_TOKEN, apr, tvl, exchangeRate: rate, risk: 'low', timestamp: Date.now() }
  } catch {
    return { token: 'sMON', protocol: 'Kintsu', contractAddress: KINTSU_TOKEN, apr: 0, tvl: 0, exchangeRate: 1.0, risk: 'low', timestamp: Date.now() }
  }
}

// ── Aggregated ───────────────────────────────────────────────

/** Returns stats for the Mellow vshMON vault as an LSTStats entry. */
async function getVshMONLST(): Promise<LSTStats> {
  const [vaults, apy] = await Promise.allSettled([getMellowVaults(), getMellowAPY()])
  const fastlaneVault = vaults.status === 'fulfilled'
    ? vaults.value.find(v => v.underlying === 'shMON')
    : undefined

  return {
    token:           'vshMON',
    protocol:        'mellow',
    contractAddress: '0x982c66D60a18F05db7D1a8987189310062d2F818',
    apr:             apy.status === 'fulfilled' ? apy.value : 0,
    exchangeRate:    fastlaneVault?.exchangeRate ?? 1,
    tvl:             fastlaneVault?.totalAssets ?? 0,
    risk:            'low' as const,
    timestamp:       Date.now(),
  }
}

/**
 * Returns stats for all 5 LSTs (aprMON, gMON, shMON, sMON, vshMON) fetched in parallel, sorted by APR descending.
 *
 * @returns Array of LSTStats sorted highest APR first; failed individual fetches are silently omitted
 *
 * @example
 * ```typescript
 * const all = await getAllLSTStats()
 * // → [{ token: 'gMON', apr: 0.100, ... }, { token: 'aprMON', apr: 0.094, ... }, ...]
 * ```
 *
 * @category LST
 */
export async function getAllLSTStats(): Promise<LSTStats[]> {
  const results = await Promise.allSettled([
    getAPrioriLST(),
    getMagmaLST(),
    getFastLaneLST(),
    getKintsuLST(),
    getVshMONLST(),
  ])
  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as PromiseFulfilledResult<LSTStats>).value)
    .sort((a, b) => b.apr - a.apr)
}

/**
 * Returns the LST with the highest current APR across all tracked protocols.
 * Excludes LSTs with APR reported as 0 (e.g. when sMON rate delta is unavailable).
 *
 * @returns LSTStats for the top-APR LST
 *
 * @example
 * ```typescript
 * const best = await getBestLST()
 * // → { token: 'gMON', protocol: 'Magma', apr: 0.100, tvl: 50200000 }  // tvl in MON
 * ```
 *
 * @category LST
 */
export async function getBestLST(): Promise<LSTStats> {
  const all = await getAllLSTStats()
  const withAPR = all.filter(l => l.apr > 0)
  if (withAPR.length === 0) throw new Error('No LST APR data available')
  return withAPR[0]
}

/**
 * Compare all LSTs and return a recommendation with the best option and reasoning.
 *
 * @returns Object containing best LST, full sorted list, combined TVL in MON, and human-readable reason string
 *
 * @example
 * ```typescript
 * const comparison = await compareLSTs()
 * // → { best: { token: 'gMON', ... }, totalTVL: 516800000, reason: '...' }  // totalTVL in MON
 * ```
 *
 * @category LST
 */
export async function compareLSTs(): Promise<{
  best: LSTStats
  all: LSTStats[]
  totalTVL: number
  reason: string
}> {
  const all = await getAllLSTStats()
  const best = all.find(l => l.apr > 0) ?? all[0]
  const totalTVL = all.reduce((s, l) => s + l.tvl, 0)
  const others = all.filter(l => l.token !== best.token && l.apr > 0)
  const reason = others.length > 0
    ? `${best.protocol} (${best.token}) leads at ${(best.apr * 100).toFixed(2)}% APR vs ${others.map(l => `${l.protocol} ${(l.apr * 100).toFixed(2)}%`).join(', ')}`
    : `${best.protocol} (${best.token}) is the best available LST with ${(best.apr * 100).toFixed(2)}% APR`
  return { best, all, totalTVL, reason }
}

/**
 * Returns the total amount of MON staked across all liquid staking protocols.
 *
 * @returns Sum of TVL (in MON) across aprMON, gMON, shMON, sMON, and vshMON
 *
 * @example
 * ```typescript
 * const total = await getTotalStakedMON()
 * // → 516800000
 * ```
 *
 * @category LST
 */
export async function getTotalStakedMON(): Promise<number> {
  const all = await getAllLSTStats()
  return all.reduce((s, l) => s + l.tvl, 0)
}
