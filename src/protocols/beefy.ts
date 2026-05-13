/**
 * @module Beefy
 * @description Beefy Finance yield optimizer on Monad Mainnet. Beefy
 * auto-compounds LP and single-asset vault positions to maximise APY.
 * Data is sourced from the public Beefy API (`https://api.beefy.finance`)
 * and Databarn historical API (`https://databarn.beefy.com`).
 *
 * **TVL:** ~$2M
 * **Type:** Yield Optimizer
 * **Docs:** https://docs.beefy.finance
 *
 * Available functions:
 * - {@link getBeefyVaults} — all vaults on Monad with live APY + TVL
 * - {@link getBeefyVaultsDetailed} — vaults with APY breakdown + fees merged
 * - {@link getBeefyBestVault} — vault with the highest APY
 * - {@link getBeefyTVL} — total USD in all Beefy vaults
 * - {@link getBeefyApyBreakdown} — per-vault APY component breakdown
 * - {@link getBeefyFees} — per-vault fee structure
 * - {@link getBeefyLPs} — LP token prices used by vaults
 * - {@link getBeefyLPBreakdown} — detailed LP info: tokens, balances, supply
 * - {@link getBeefyTokens} — all tokens Beefy uses on Monad
 * - {@link getBeefyBoosts} — active and historic Launchpool boosts on Monad
 * - {@link getBeefyConfig} — contract configuration addresses on Monad
 * - {@link getBeefyHistoricalPrices} — historical price series (Databarn)
 * - {@link getBeefyWalletTimeline} — per-wallet vault activity timeline (Databarn)
 */

// ============================================================
// Rampart SDK — Beefy Finance on Monad
// Yield optimizer — auto-compounds LP and vault positions
// VaultFactory: 0x9818dF1Bdce8D0E79B982e2C3a93ac821b3c17e0
// API: https://api.beefy.finance
// Databarn: https://databarn.beefy.com
// ============================================================

export const BEEFY_ADDRESSES = {
  vaultFactory: '0x9818dF1Bdce8D0E79B982e2C3a93ac821b3c17e0' as `0x${string}`,
  clmFactory:   '0x03C2E2e84031d913d45B1F5b5dDC8E50Fcb28652' as `0x${string}`,
} as const

const BEEFY_API    = 'https://api.beefy.finance'
const DATABARN_API = 'https://databarn.beefy.com'

async function beefyFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return res.json() as Promise<T>
  } catch {
    return null
  }
}

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
  depositsPaused: boolean
  risks:       string[]
}

export interface BeefyApyBreakdown {
  vaultId:             string
  totalApy:            number
  vaultApr:            number
  compoundingsPerYear: number
  beefyPerformanceFee: number
  lpFee:               number
  tradingApr:          number
}

export interface BeefyFees {
  vaultId:     string
  performance: number
  withdrawal:  number
  strategist:  number
  call:        number
  treasury:    number
}

export interface BeefyVaultDetailed extends BeefyVault {
  apyBreakdown: BeefyApyBreakdown | null
  fees:         BeefyFees | null
}

export interface BeefyLP {
  id:    string
  price: number
}

export interface BeefyLPBreakdown {
  id:          string
  price:       number
  tokens:      string[]
  balances:    string[]
  totalSupply: string
}

export interface BeefyToken {
  id:       string
  symbol:   string
  address:  string
  decimals: number
  chainId:  number
  logoURI?: string
}

export interface BeefyBoost {
  id:                   string
  poolId:               string
  name:                 string
  status:               string
  tokenAddress:         string
  earnedTokenAddress:   string
  earnContractAddress:  string
  earnedToken:          string
  periodFinish?:        number
  rewards?:             unknown[]
}

export interface BeefyConfig {
  devMultisig?:      string
  treasuryMultisig?: string
  strategyOwner?:    string
  vaultOwner?:       string
  keeper?:           string
  treasurer?:        string
  launchpoolOwner?:  string
  [key: string]:     string | undefined
}

export interface BeefyPricePoint {
  t: number
  v: number
}

export interface BeefyWalletEvent {
  datetime:        string
  productKey:      string
  displayName:     string
  vaultAddress:    string
  underlyingBreakdown: unknown[]
  usdBalance:      number
  shareBalance:    number
  transactionHash: string
  type:            string
}

/**
 * Fetch all Beefy Finance vaults on Monad with live APY and TVL.
 *
 * @category Yield
 */
export async function getBeefyVaults(): Promise<BeefyVault[]> {
  const [vaultsData, apyData, tvlData] = await Promise.all([
    beefyFetch<unknown[]>(`${BEEFY_API}/vaults?chain=monad`),
    beefyFetch<Record<string, number>>(`${BEEFY_API}/apy`),
    beefyFetch<Record<string, unknown>>(`${BEEFY_API}/tvl`),
  ])

  if (!Array.isArray(vaultsData)) return []

  const apy = apyData ?? {}
  const tvl = tvlData ?? {}

  return vaultsData
    .filter((v: any) => v.chain === 'monad' || v.network === 'monad')
    .map((v: any) => ({
      id:             v.id ?? '',
      name:           v.name ?? v.id ?? '',
      token:          v.token ?? v.want ?? '',
      chain:          'monad',
      apy:            apy[v.id] ?? 0,
      tvlUSD:         typeof tvl[v.id] === 'object' ? (tvl[v.id] as any)?.monad ?? 0 : (tvl[v.id] as number) ?? 0,
      status:         v.status ?? 'active',
      platform:       v.platform ?? '',
      address:        v.earnContractAddress ?? v.address ?? '',
      depositsPaused: v.depositsPaused ?? false,
      risks:          v.risks ?? [],
    }))
}

/**
 * Fetch all vaults enriched with APY breakdown and fee structure.
 *
 * @category Yield
 */
export async function getBeefyVaultsDetailed(): Promise<BeefyVaultDetailed[]> {
  const [vaults, apyBreakdowns, feesData] = await Promise.all([
    getBeefyVaults(),
    beefyFetch<Record<string, unknown>>(`${BEEFY_API}/apy/breakdown`),
    beefyFetch<Record<string, unknown>>(`${BEEFY_API}/fees`),
  ])

  return vaults.map(vault => ({
    ...vault,
    apyBreakdown: apyBreakdowns?.[vault.id]
      ? parseApyBreakdown(vault.id, apyBreakdowns[vault.id] as Record<string, unknown>)
      : null,
    fees: feesData?.[vault.id]
      ? parseFees(vault.id, feesData[vault.id] as Record<string, unknown>)
      : null,
  }))
}

function parseApyBreakdown(vaultId: string, raw: Record<string, unknown>): BeefyApyBreakdown {
  return {
    vaultId,
    totalApy:            Number(raw.totalApy            ?? raw.total        ?? 0),
    vaultApr:            Number(raw.vaultApr            ?? raw.apr          ?? 0),
    compoundingsPerYear: Number(raw.compoundingsPerYear ?? 365),
    beefyPerformanceFee: Number(raw.beefyPerformanceFee ?? 0),
    lpFee:               Number(raw.lpFee               ?? 0),
    tradingApr:          Number(raw.tradingApr           ?? 0),
  }
}

function parseFees(vaultId: string, raw: Record<string, unknown>): BeefyFees {
  const perf = (raw.performance as Record<string, number>) ?? {}
  return {
    vaultId,
    performance: Number(raw.total ?? 0),
    withdrawal:  Number(raw.withdraw ?? 0),
    strategist:  Number(perf.strategist ?? 0),
    call:        Number(perf.call ?? 0),
    treasury:    Number(perf.treasury ?? 0),
  }
}

/**
 * Return the active Beefy vault with the highest APY on Monad.
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
 * @category Yield
 */
export async function getBeefyTVL(): Promise<number> {
  const vaults = await getBeefyVaults()
  return vaults.reduce((sum, v) => sum + v.tvlUSD, 0)
}

/**
 * Fetch per-vault APY breakdown for all Monad vaults.
 *
 * Returns a map of vaultId → breakdown. Useful when you only need
 * yield component data without the full vault list.
 *
 * @category Yield
 */
export async function getBeefyApyBreakdown(): Promise<BeefyApyBreakdown[]> {
  const [raw, vaults] = await Promise.all([
    beefyFetch<Record<string, unknown>>(`${BEEFY_API}/apy/breakdown`),
    getBeefyVaults(),
  ])
  if (!raw) return []
  const monadIds = new Set(vaults.map(v => v.id))
  return Object.entries(raw)
    .filter(([id]) => monadIds.has(id))
    .map(([id, data]) => parseApyBreakdown(id, data as Record<string, unknown>))
}

/**
 * Fetch per-vault fee structure for all Monad vaults.
 *
 * @category Yield
 */
export async function getBeefyFees(): Promise<BeefyFees[]> {
  const [raw, vaults] = await Promise.all([
    beefyFetch<Record<string, unknown>>(`${BEEFY_API}/fees`),
    getBeefyVaults(),
  ])
  if (!raw) return []
  const monadIds = new Set(vaults.map(v => v.id))
  return Object.entries(raw)
    .filter(([id]) => monadIds.has(id))
    .map(([id, data]) => parseFees(id, data as Record<string, unknown>))
}

/**
 * Fetch prices of LP tokens underlying Beefy vaults on Monad.
 *
 * @category Yield
 */
export async function getBeefyLPs(): Promise<BeefyLP[]> {
  const [raw, vaults] = await Promise.all([
    beefyFetch<Record<string, number>>(`${BEEFY_API}/lps`),
    getBeefyVaults(),
  ])
  if (!raw) return []
  const monadTokens = new Set(vaults.map(v => v.token))
  return Object.entries(raw)
    .filter(([id]) => monadTokens.has(id))
    .map(([id, price]) => ({ id, price: Number(price) }))
}

/**
 * Fetch detailed LP breakdown (token addresses, balances, supply) for Monad vaults.
 *
 * @category Yield
 */
export async function getBeefyLPBreakdown(): Promise<BeefyLPBreakdown[]> {
  const [raw, vaults] = await Promise.all([
    beefyFetch<Record<string, unknown>>(`${BEEFY_API}/lps/breakdown`),
    getBeefyVaults(),
  ])
  if (!raw) return []
  const monadTokens = new Set(vaults.map(v => v.token))
  return Object.entries(raw)
    .filter(([id]) => monadTokens.has(id))
    .map(([id, data]: [string, any]) => ({
      id,
      price:       Number(data?.price ?? 0),
      tokens:      Array.isArray(data?.tokens)   ? data.tokens   : [],
      balances:    Array.isArray(data?.balances)  ? data.balances : [],
      totalSupply: String(data?.totalSupply ?? '0'),
    }))
}

/**
 * Fetch all tokens Beefy uses on Monad.
 *
 * @category Yield
 */
export async function getBeefyTokens(): Promise<BeefyToken[]> {
  const raw = await beefyFetch<Record<string, unknown>>(`${BEEFY_API}/tokens/monad`)
  if (!raw || typeof raw !== 'object') return []
  return Object.entries(raw).map(([id, data]: [string, any]) => ({
    id,
    symbol:   data?.symbol  ?? id,
    address:  data?.address ?? '',
    decimals: Number(data?.decimals ?? 18),
    chainId:  Number(data?.chainId  ?? 143),
    logoURI:  data?.logoURI,
  }))
}

/**
 * Fetch Launchpool boosts on Monad — active and historic.
 *
 * @category Yield
 */
export async function getBeefyBoosts(): Promise<BeefyBoost[]> {
  const raw = await beefyFetch<unknown[]>(`${BEEFY_API}/boosts/monad`)
  if (!Array.isArray(raw)) return []
  return raw.map((b: any) => ({
    id:                  b.id ?? '',
    poolId:              b.poolId ?? '',
    name:                b.name ?? '',
    status:              b.status ?? 'active',
    tokenAddress:        b.tokenAddress ?? '',
    earnedTokenAddress:  b.earnedTokenAddress ?? '',
    earnContractAddress: b.earnContractAddress ?? '',
    earnedToken:         b.earnedToken ?? '',
    periodFinish:        b.periodFinish,
    rewards:             b.rewards,
  }))
}

/**
 * Fetch Beefy contract configuration addresses on Monad.
 *
 * @category Yield
 */
export async function getBeefyConfig(): Promise<BeefyConfig> {
  const raw = await beefyFetch<Record<string, unknown>>(`${BEEFY_API}/config/monad`)
  if (!raw) return {}
  const result: BeefyConfig = {}
  for (const [k, v] of Object.entries(raw)) {
    result[k] = String(v)
  }
  return result
}

/**
 * Fetch historical price series for a vault from Databarn.
 *
 * @param productKey - Beefy product key, e.g. `beefy:vault:monad:beefy-mon-usdc`
 * @param since      - Unix timestamp in seconds (defaults to 30 days ago)
 *
 * @category Yield
 */
export async function getBeefyHistoricalPrices(
  productKey: string,
  since?: number,
): Promise<BeefyPricePoint[]> {
  const from  = since ?? Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60
  const url   = `${DATABARN_API}/api/v1/price/${encodeURIComponent(productKey)}?since=${from}`
  const raw   = await beefyFetch<unknown[]>(url)
  if (!Array.isArray(raw)) return []
  return raw.map((p: any) => ({ t: Number(p.t ?? p.timestamp ?? 0), v: Number(p.v ?? p.value ?? 0) }))
}

/**
 * Fetch per-wallet vault activity timeline from Databarn.
 *
 * Shows deposit/withdraw events with USD balance snapshots for a given wallet.
 *
 * @param walletAddress - EVM wallet address
 *
 * @category Yield
 */
export async function getBeefyWalletTimeline(walletAddress: string): Promise<BeefyWalletEvent[]> {
  const url = `${DATABARN_API}/api/v1/beefy/timeline?address=${walletAddress}&chain=monad`
  const raw = await beefyFetch<unknown[]>(url)
  if (!Array.isArray(raw)) return []
  return raw.map((e: any) => ({
    datetime:            e.datetime            ?? '',
    productKey:          e.productKey          ?? '',
    displayName:         e.displayName         ?? '',
    vaultAddress:        e.vaultAddress        ?? '',
    underlyingBreakdown: e.underlyingBreakdown ?? [],
    usdBalance:          Number(e.usdBalance   ?? 0),
    shareBalance:        Number(e.shareBalance ?? 0),
    transactionHash:     e.transactionHash     ?? '',
    type:                e.type                ?? '',
  }))
}
