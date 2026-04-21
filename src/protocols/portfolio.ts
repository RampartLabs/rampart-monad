/**
 * @module Portfolio
 * @description Wallet DeFi portfolio tracker for Monad mainnet.
 * Aggregates native MON balance, ERC20 holdings, liquid staking positions,
 * and Euler V2 lending positions into a single USD-denominated snapshot.
 *
 * **TVL:** N/A
 * **Type:** Wallet Portfolio Tracker
 * **Docs:** N/A
 *
 * Available functions:
 * - {@link getNativeBalance} — MON balance for a wallet
 * - {@link getTokenBalances} — all tracked ERC20 token balances
 * - {@link getLSTPositions} — LST holdings (aprMON, gMON, shMON, sMON) with MON-equivalent values
 * - {@link getEulerPositions} — Euler V2 supplied positions with underlying asset values
 * - {@link getPortfolio} — full wallet DeFi snapshot (native + tokens + LSTs + Euler)
 * - {@link getPortfolioSummary} — USD-denominated summary with category breakdown
 */

// ============================================================
// Rampart SDK — Wallet Portfolio (Phase 13)
// Multicall ERC20 balances, LST positions, Neverland health
// getPortfolio(address) → full DeFi snapshot in one call
// ============================================================

import { publicClient } from '../chain'
import { TOKENS } from './dex/tokens'
import { getAllLSTStats }  from './staking'
import { getLendingRates } from './neverland'
import { getVerifiedPrice } from './oracles'
import { getEulerVaults }   from './euler'

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function' as const, inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'decimals',  type: 'function' as const, inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' as const },
  { name: 'symbol',    type: 'function' as const, inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' as const },
] as const

const NEVERLAND_ABI = [
  { name: 'getAccountHealth', type: 'function' as const, inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'balanceOf',        type: 'function' as const, inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
] as const

const EULER_VAULT_ABI = [
  { name: 'balanceOf',       type: 'function' as const, inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'convertToAssets', type: 'function' as const, inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'decimals',        type: 'function' as const, inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' as const },
] as const

export interface TokenBalance {
  symbol:       string
  address:      string
  balance:      number     // in token units
  balanceRaw:   bigint
  decimals:     number
  usdValue?:    number
}

export interface LSTPosition {
  token:        string     // aprMON, gMON, shMON, sMON
  protocol:     string
  balance:      number     // LST token units
  monValue:     number     // equivalent MON
  usdValue?:    number
  apr:          number
}

export interface EulerPosition {
  vaultSymbol:  string
  assetSymbol:  string
  vaultAddress: string
  shares:       number
  assetValue:   number     // in underlying asset units
  supplyAPY:    number
}

export interface Portfolio {
  address:       string
  nativeBalance: number    // MON balance
  tokens:        TokenBalance[]
  lstPositions:  LSTPosition[]
  eulerPositions: EulerPosition[]
  totalUsdValue: number
  fetchedAt:     number    // unix timestamp
}

const TRACKED_TOKENS = ['USDC', 'AUSD', 'WMON', 'USDT0', 'WETH', 'WBTC']

// Verified addresses — must match staking.ts constants exactly
const LST_ADDRESSES: Record<string, `0x${string}`> = {
  aprMON: '0x0c65A0BC65a5D819235B71F554D210D3F80E0852',
  gMON:   '0x8498312a6b3cbd158bf0c93abdcf29e6e4f55081',
  shMON:  '0x1b68626dca36c7fe922fd2d55e4f631d962de19c',
  sMON:   '0xe1d2439b75fb9746E7Bc6cB777Ae10AA7f7ef9c5',  // ERC20 token (not vault 0xa3227...)
}

/**
 * Returns the native MON balance of a wallet in MON units.
 *
 * @param address - EVM wallet address (checksummed or lowercase 0x...)
 * @returns MON balance as a floating-point number (wei divided by 1e18)
 *
 * @example
 * ```typescript
 * const balance = await getNativeBalance('0xabc...123')
 * // → 42.5
 * ```
 *
 * @category Portfolio
 */
export async function getNativeBalance(address: `0x${string}`): Promise<number> {
  const raw = await publicClient.getBalance({ address })
  return Number(raw) / 1e18
}

/**
 * Returns non-zero ERC20 token balances for a wallet across tracked Monad tokens.
 * Tracked tokens: USDC, AUSD, WMON, USDT0, WETH, WBTC.
 *
 * @param address - EVM wallet address (checksummed or lowercase 0x...)
 * @returns Array of TokenBalance entries for tokens with a non-zero balance
 *
 * @example
 * ```typescript
 * const balances = await getTokenBalances('0xabc...123')
 * // → [{ symbol: 'USDC', balance: 1000, decimals: 6, ... }]
 * ```
 *
 * @category Portfolio
 */
export async function getTokenBalances(address: `0x${string}`): Promise<TokenBalance[]> {
  const results: TokenBalance[] = []
  await Promise.allSettled(
    TRACKED_TOKENS.map(async (symbol) => {
      const token = TOKENS[symbol]
      if (!token) return
      try {
        const [balRaw, dec] = await Promise.all([
          publicClient.readContract({ address: token.address as `0x${string}`, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }),
          publicClient.readContract({ address: token.address as `0x${string}`, abi: ERC20_ABI, functionName: 'decimals' }),
        ])
        const balance = Number(balRaw as bigint) / 10 ** Number(dec)
        if (balance > 0) {
          results.push({ symbol, address: token.address, balance, balanceRaw: balRaw as bigint, decimals: Number(dec) })
        }
      } catch { /* skip */ }
    })
  )
  return results
}

/**
 * Returns all liquid staking token positions held by a wallet with MON-equivalent values.
 * Covers aprMON, gMON, shMON, and sMON; exchange rates sourced from staking module.
 *
 * @param address - EVM wallet address (checksummed or lowercase 0x...)
 * @returns Array of LSTPosition entries for tokens with a non-zero balance
 *
 * @example
 * ```typescript
 * const positions = await getLSTPositions('0xabc...123')
 * // → [{ token: 'shMON', protocol: 'FastLane', balance: 100, monValue: 154.2, apr: 0.054 }]
 * ```
 *
 * @category Portfolio
 */
export async function getLSTPositions(address: `0x${string}`): Promise<LSTPosition[]> {
  const [lstStats] = await Promise.all([getAllLSTStats()])
  const positions: LSTPosition[] = []
  await Promise.allSettled(
    Object.entries(LST_ADDRESSES).map(async ([token, contractAddr]) => {
      try {
        const [balRaw, dec] = await Promise.all([
          publicClient.readContract({ address: contractAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }),
          publicClient.readContract({ address: contractAddr, abi: ERC20_ABI, functionName: 'decimals' }),
        ])
        const balance = Number(balRaw as bigint) / 10 ** Number(dec)
        if (balance === 0) return
        const stat = lstStats.find(s => s.token === token)
        const monValue = balance * (stat?.exchangeRate ?? 1)
        positions.push({
          token,
          protocol:  stat?.protocol ?? 'unknown',
          balance,
          monValue,
          apr:       stat?.apr ?? 0,
        })
      } catch { /* skip */ }
    })
  )
  return positions
}

/**
 * Returns all Euler V2 vault positions held by a wallet with underlying asset values.
 * Scans up to 108 Euler vaults; positions with zero shares are skipped.
 *
 * @param address - EVM wallet address (checksummed or lowercase 0x...)
 * @returns Array of EulerPosition entries for vaults where the wallet holds shares
 *
 * @example
 * ```typescript
 * const positions = await getEulerPositions('0xabc...123')
 * // → [{ vaultSymbol: 'eUSDC', assetSymbol: 'USDC', assetValue: 500, supplyAPY: 0.05 }]
 * ```
 *
 * @category Portfolio
 */
export async function getEulerPositions(address: `0x${string}`): Promise<EulerPosition[]> {
  const vaults = await getEulerVaults(108)
  const positions: EulerPosition[] = []
  await Promise.allSettled(
    vaults.map(async (vault) => {
      try {
        const vaultAddr = vault.address as `0x${string}`
        const [shares, dec] = await Promise.all([
          publicClient.readContract({ address: vaultAddr, abi: EULER_VAULT_ABI, functionName: 'balanceOf', args: [address] }),
          publicClient.readContract({ address: vaultAddr, abi: EULER_VAULT_ABI, functionName: 'decimals' }),
        ])
        if ((shares as bigint) === 0n) return
        const assets = await publicClient.readContract({
          address: vaultAddr, abi: EULER_VAULT_ABI, functionName: 'convertToAssets', args: [shares as bigint],
        })
        const assetValue = Number(assets as bigint) / 10 ** Number(dec)
        const sharesNum  = Number(shares as bigint) / 10 ** Number(dec)
        positions.push({
          vaultSymbol:  vault.vaultSymbol,
          assetSymbol:  vault.assetSymbol,
          vaultAddress: vault.address,
          shares:       sharesNum,
          assetValue,
          supplyAPY:    vault.supplyAPY,
        })
      } catch { /* skip */ }
    })
  )
  return positions
}

/**
 * Returns a full DeFi portfolio snapshot for a wallet address.
 * Fetches native MON balance, ERC20 tokens, LST positions, and Euler vault positions in parallel.
 *
 * @param address - EVM wallet address as a hex string (must match /^0x[0-9a-fA-F]{40}$/)
 * @returns Portfolio with all positions and total USD value; throws on invalid address format
 *
 * @example
 * ```typescript
 * const portfolio = await getPortfolio('0xabc...123')
 * // → { nativeBalance: 42.5, tokens: [...], lstPositions: [...], totalUsdValue: 1320.50 }
 * ```
 *
 * @category Portfolio
 */
export async function getPortfolio(address: string): Promise<Portfolio> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error(`Invalid address: ${address}`)
  const addr = address as `0x${string}`
  const [native, tokens, lstPositions, eulerPositions, monPrice] = await Promise.all([
    getNativeBalance(addr),
    getTokenBalances(addr),
    getLSTPositions(addr),
    getEulerPositions(addr),
    getVerifiedPrice('MON').catch(() => ({ bestPrice: 0 })),
  ])

  const monUsd = monPrice.bestPrice

  // Add USD values
  for (const t of tokens) {
    if (['USDC', 'AUSD', 'USDT0'].includes(t.symbol)) t.usdValue = t.balance
    else if (['WMON'].includes(t.symbol)) t.usdValue = t.balance * monUsd
  }
  for (const l of lstPositions) {
    l.usdValue = l.monValue * monUsd
  }

  const nativeUsd   = native * monUsd
  const tokensUsd   = tokens.reduce((s, t) => s + (t.usdValue ?? 0), 0)
  const lstUsd      = lstPositions.reduce((s, l) => s + (l.usdValue ?? 0), 0)

  return {
    address,
    nativeBalance: native,
    tokens,
    lstPositions,
    eulerPositions,
    totalUsdValue: nativeUsd + tokensUsd + lstUsd,
    fetchedAt:     Math.floor(Date.now() / 1000),
  }
}

/**
 * Returns a USD-denominated portfolio summary with per-category breakdown and percentage allocation.
 * Categories: Native MON, Stablecoins, LST Positions, Euler Lending.
 *
 * @param address - EVM wallet address as a hex string
 * @returns Object with totalUsd, and breakdown array of { category, usd, pct } (empty categories omitted)
 *
 * @example
 * ```typescript
 * const summary = await getPortfolioSummary('0xabc...123')
 * // → { totalUsd: 1320.50, breakdown: [{ category: 'LST Positions', usd: 800, pct: 60.6 }, ...] }
 * ```
 *
 * @category Portfolio
 */
export async function getPortfolioSummary(address: string): Promise<{
  address: string
  totalUsd: number
  breakdown: { category: string; usd: number; pct: number }[]
}> {
  const [portfolio, monPriceResult] = await Promise.all([
    getPortfolio(address),
    getVerifiedPrice('MON').catch(() => ({ bestPrice: 0 })),
  ])
  const { totalUsdValue: total } = portfolio
  const monPriceUsd = monPriceResult.bestPrice

  const monUsd    = portfolio.nativeBalance * monPriceUsd
  const stableUsd = portfolio.tokens.filter(t => ['USDC', 'AUSD', 'USDT0'].includes(t.symbol))
    .reduce((s, t) => s + (t.usdValue ?? 0), 0)
  const lstUsd    = portfolio.lstPositions.reduce((s, l) => s + (l.usdValue ?? 0), 0)
  const eulerUsd  = portfolio.eulerPositions.reduce((s, e) => s + e.assetValue, 0)

  const breakdown = [
    { category: 'Native MON',   usd: monUsd,    pct: total > 0 ? (monUsd    / total) * 100 : 0 },
    { category: 'Stablecoins',  usd: stableUsd, pct: total > 0 ? (stableUsd / total) * 100 : 0 },
    { category: 'LST Positions',usd: lstUsd,    pct: total > 0 ? (lstUsd    / total) * 100 : 0 },
    { category: 'Euler Lending',usd: eulerUsd,  pct: total > 0 ? (eulerUsd  / total) * 100 : 0 },
  ].filter(b => b.usd > 0)

  return { address, totalUsd: total, breakdown }
}
