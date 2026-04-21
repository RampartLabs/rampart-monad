/**
 * @module Upshift
 * @description Upshift yield aggregator vaults on Monad Mainnet.
 * All vaults implement ERC4626; APY is estimated by comparing `convertToAssets`
 * at the current block versus a historical block (falling back through multiple
 * delta sizes to handle chains with limited history).
 *
 * **TVL:** ~$3M
 * **Type:** Yield Aggregator
 * **Docs:** https://upshift.finance
 *
 * Available functions:
 * - {@link getUpshiftVaults} — all Upshift yield vaults with APY and TVL
 * - {@link getUpshiftTVL} — total USD locked in all Upshift vaults
 * - {@link getBestUpshiftVault} — vault with the highest current APY
 */

import { publicClient } from '../chain'
import { MONAD_BLOCKS_PER_YEAR } from '../chain'

const APR_BLOCK_DELTA = 72_000n

const KNOWN_VAULTS: { address: `0x${string}`; name: string }[] = [
  { address: '0x36edbf0c834591bfdfcac0ef9605528c75c406aa', name: 'earnAUSD' },
  { address: '0xd793c04b87386a6bb84ee61d98e0065fde7fda5e', name: 'Savings AUSD' },
  { address: '0x64996271ee085ef9e6e939ab3eacd93f7d7080db', name: 'WMON/AUSD' },
  { address: '0xb667d005695d7f530a5621549ae31d9409486e29', name: 'WBTC/AUSD' },
]

const VAULT_ABI = [
  { name: 'asset',           type: 'function' as const, inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
  { name: 'name',            type: 'function' as const, inputs: [], outputs: [{ type: 'string'  }], stateMutability: 'view' as const },
  { name: 'symbol',          type: 'function' as const, inputs: [], outputs: [{ type: 'string'  }], stateMutability: 'view' as const },
  { name: 'totalAssets',     type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'convertToAssets', type: 'function' as const, inputs: [{ type: 'uint256', name: 'shares' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
] as const

const ERC20_ABI = [
  { name: 'symbol',   type: 'function' as const, inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' as const },
  { name: 'decimals', type: 'function' as const, inputs: [], outputs: [{ type: 'uint8'  }], stateMutability: 'view' as const },
] as const

export interface UpshiftVault {
  address:      string
  name:         string
  symbol:       string
  assetSymbol:  string
  assetAddress: string
  totalAssets:  number
  exchangeRate: number
  apy:          number
  protocol:     'upshift'
}

async function calcVaultAPY(vault: `0x${string}`): Promise<number> {
  const blockNow = await publicClient.getBlockNumber()
  const deltas = [500_000n, APR_BLOCK_DELTA, 7_200n, 1_800n]
  for (const delta of deltas) {
    if (blockNow < delta) continue
    try {
      const [rateNow, ratePast] = await Promise.all([
        publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'convertToAssets', args: [1_000_000_000_000_000_000n] }),
        publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'convertToAssets', args: [1_000_000_000_000_000_000n], blockNumber: blockNow - delta }),
      ])
      const rn = Number(rateNow), rp = Number(ratePast)
      if (rp === 0 || rn === rp) continue
      return ((rn - rp) / rp) * (MONAD_BLOCKS_PER_YEAR / Number(delta))
    } catch { continue }
  }
  return 0
}

/**
 * Returns all active Upshift ERC4626 yield vaults on Monad, sorted by total assets.
 *
 * For each known vault, fetches name, symbol, underlying asset, `totalAssets`, and the
 * current exchange rate via multicall. APY is calculated by comparing `convertToAssets`
 * across block deltas (500k → 72k → 7.2k → 1.8k blocks). Vaults with zero assets are excluded.
 *
 * @returns Array of {@link UpshiftVault} objects sorted descending by `totalAssets`
 *
 * @example
 * ```typescript
 * const vaults = await getUpshiftVaults()
 * // → [{ name: 'earnAUSD', apy: 0.094, totalAssets: 1200000, assetSymbol: 'AUSD', ... }]
 * ```
 *
 * @category Yield
 */
export async function getUpshiftVaults(): Promise<UpshiftVault[]> {
  const results = await Promise.allSettled(
    KNOWN_VAULTS.map(async ({ address, name: knownName }) => {
      const calls = await publicClient.multicall({
        contracts: [
          { address, abi: VAULT_ABI, functionName: 'name'   },
          { address, abi: VAULT_ABI, functionName: 'symbol' },
          { address, abi: VAULT_ABI, functionName: 'asset'  },
          { address, abi: VAULT_ABI, functionName: 'totalAssets' },
          { address, abi: VAULT_ABI, functionName: 'convertToAssets', args: [1_000_000_000_000_000_000n] as const },
        ],
        allowFailure: true,
      })

      const name          = calls[0].status === 'success' ? (calls[0].result as string)          : knownName
      const symbol        = calls[1].status === 'success' ? (calls[1].result as string)          : ''
      const assetAddr     = calls[2].status === 'success' ? (calls[2].result as `0x${string}`)   : null
      const totalAssetsRaw = calls[3].status === 'success' ? (calls[3].result as bigint)         : 0n
      const exchangeRaw   = calls[4].status === 'success' ? (calls[4].result as bigint)          : 0n
      if (!assetAddr) return null

      const tokenCalls = await publicClient.multicall({
        contracts: [
          { address: assetAddr, abi: ERC20_ABI, functionName: 'symbol'   },
          { address: assetAddr, abi: ERC20_ABI, functionName: 'decimals' },
        ],
        allowFailure: true,
      })

      const assetSym = tokenCalls[0].status === 'success' ? (tokenCalls[0].result as string) : 'UNKNOWN'
      const assetDec = tokenCalls[1].status === 'success' ? Number(tokenCalls[1].result as number) : 18

      const divisor     = 10n ** BigInt(assetDec)
      const totalAssets = Number(totalAssetsRaw / divisor)
      if (totalAssets === 0) return null

      const apy = await calcVaultAPY(address)

      return {
        address,
        name,
        symbol,
        assetSymbol:  assetSym,
        assetAddress: assetAddr,
        totalAssets,
        exchangeRate: Number(exchangeRaw) / 10 ** assetDec,
        apy,
        protocol: 'upshift' as const,
      }
    }),
  )

  return results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => (r as PromiseFulfilledResult<UpshiftVault>).value)
    .sort((a, b) => b.totalAssets - a.totalAssets)
}

/**
 * Returns total USD deposited across all Upshift vaults.
 *
 * Sums `totalAssets` from every vault returned by {@link getUpshiftVaults}.
 *
 * @returns Total TVL in USD as a plain number
 *
 * @example
 * ```typescript
 * const tvl = await getUpshiftTVL()
 * // → 3100000
 * ```
 *
 * @category Yield
 */
export async function getUpshiftTVL(): Promise<number> {
  const vaults = await getUpshiftVaults()
  return vaults.reduce((s, v) => s + v.totalAssets, 0)
}

/**
 * Returns the Upshift vault with the highest current APY.
 *
 * Fetches all vaults via {@link getUpshiftVaults} and returns the one with the
 * maximum `apy` value. Throws if no vaults are available.
 *
 * @returns The {@link UpshiftVault} with the highest APY
 * @throws Error if no Upshift vaults are found on-chain
 *
 * @example
 * ```typescript
 * const best = await getBestUpshiftVault()
 * // → { name: 'WMON/AUSD', apy: 0.134, totalAssets: 850000, ... }
 * ```
 *
 * @category Yield
 */
export async function getBestUpshiftVault(): Promise<UpshiftVault> {
  const vaults = await getUpshiftVaults()
  if (vaults.length === 0) throw new Error('No Upshift vaults found')
  return [...vaults].sort((a, b) => b.apy - a.apy)[0]
}
