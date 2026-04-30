/**
 * @module UltraYield
 * @description UltraYield by Edge — three ERC-4626 Gearbox V3 lending vaults on Monad Mainnet.
 * Edge Capital's structured yield product built on top of Gearbox credit pools.
 * TVL is a subset of Gearbox TVL and is NOT counted separately in getMonadDeFiTVL.
 *
 * **TVL:** ~$24M (counted inside Gearbox lending bucket)
 * **Type:** Yield Vault (ERC-4626, Gearbox V3 underlying)
 * **Docs:** https://ultrayield.edge.capital
 *
 * Available functions:
 * - {@link getUltraYieldVaults} — all three UltraYield vaults with APY and TVL
 * - {@link getUltraYieldTVL} — combined TVL across all vaults in USD
 */

import { getGearboxPools } from './gearbox'

export const ULTRAYIELD_ADDRESSES = {
  USDC:  '0x6b343f7b797f1488aa48c49d540690f2b2c89751' as `0x${string}`,
  AUSD:  '0xc4173359087ce643235420b7bc610d9b0cf2b82d' as `0x${string}`,
  USDT0: '0x164a35f31e4e0f6c45d500962a6978d2cbd5a16b' as `0x${string}`,
} as const

export interface UltraYieldVault {
  address:      string
  name:         string
  assetSymbol:  string
  totalAssets:  number
  supplyAPY:    number
  protocol:     'ultrayield'
}

/**
 * Returns UltraYield by Edge vault stats (USDC, AUSD, USDT0).
 *
 * Data is sourced directly from the underlying Gearbox V3 credit pools.
 *
 * @returns Array of {@link UltraYieldVault} sorted descending by `totalAssets`
 *
 * @example
 * ```typescript
 * const vaults = await getUltraYieldVaults()
 * // → [{ name: 'UltraYield USDC', supplyAPY: 0.082, totalAssets: 19700000, ... }]
 * ```
 *
 * @category Yield
 */
export async function getUltraYieldVaults(): Promise<UltraYieldVault[]> {
  const pools = await getGearboxPools()
  const knownAddrs = new Set(Object.values(ULTRAYIELD_ADDRESSES).map(a => a.toLowerCase()))

  return pools
    .filter(p => knownAddrs.has(p.address.toLowerCase()))
    .map(p => ({
      address:     p.address,
      name:        `UltraYield ${p.assetSymbol}`,
      assetSymbol: p.assetSymbol,
      totalAssets: p.totalAssets,
      supplyAPY:   p.supplyAPY,
      protocol:    'ultrayield' as const,
    }))
    .sort((a, b) => b.totalAssets - a.totalAssets)
}

/**
 * Returns combined TVL across all UltraYield vaults in USD.
 *
 * Note: this TVL is already included in `getGearboxTVL()` and `getMonadDeFiTVL()`.
 *
 * @returns Total TVL in USD
 *
 * @example
 * ```typescript
 * const tvl = await getUltraYieldTVL()
 * // → 24000000
 * ```
 *
 * @category Yield
 */
export async function getUltraYieldTVL(): Promise<number> {
  const vaults = await getUltraYieldVaults()
  return vaults.reduce((s, v) => s + v.totalAssets, 0)
}
