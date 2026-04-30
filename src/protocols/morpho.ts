/**
 * @module Morpho
 * @description MetaMorpho vault aggregator for Monad mainnet.
 * Vaults are discovered via the Morpho GraphQL API (api.morpho.org/graphql)
 * which avoids the Monad RPC 100-block eth_getLogs limit. APY is computed
 * from on-chain exchange-rate deltas.
 *
 * **TVL:** ~$30M
 * **Type:** Lending (MetaMorpho Vaults)
 * **Docs:** https://docs.morpho.org
 *
 * Available functions:
 * - {@link getMorphoVaults} — all MetaMorpho vaults with supply APY and TVL
 * - {@link getMorphoTVL} — total USD locked across all Morpho stablecoin vaults
 * - {@link getBestMorphoVault} — vault with the highest supply APY
 */

import { publicClient } from '../chain'
import { MONAD_BLOCKS_PER_YEAR } from '../chain'

export const MORPHO_BLUE: `0x${string}` = '0xd5d960e8c380b724a48ac59e2dff1b2cb4a1eaee'
const MORPHO_API    = 'https://api.morpho.org/graphql'
const MONAD_CHAIN_ID = 143
const APR_BLOCK_DELTA = 72_000n

const VAULT_ABI = [
  { name: 'asset',             type: 'function' as const, inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
  { name: 'name',              type: 'function' as const, inputs: [], outputs: [{ type: 'string'  }], stateMutability: 'view' as const },
  { name: 'symbol',            type: 'function' as const, inputs: [], outputs: [{ type: 'string'  }], stateMutability: 'view' as const },
  { name: 'totalAssets',       type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'convertToAssets',   type: 'function' as const, inputs: [{ type: 'uint256', name: 'shares' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'fee',               type: 'function' as const, inputs: [], outputs: [{ type: 'uint96'  }], stateMutability: 'view' as const },
  { name: 'supplyQueueLength', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'supplyQueue',       type: 'function' as const, inputs: [{ type: 'uint256', name: 'index' }], outputs: [{ type: 'bytes32' }], stateMutability: 'view' as const },
  { name: 'curator',           type: 'function' as const, inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
] as const

const ERC20_ABI = [
  { name: 'symbol',   type: 'function' as const, inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' as const },
  { name: 'decimals', type: 'function' as const, inputs: [], outputs: [{ type: 'uint8'  }], stateMutability: 'view' as const },
] as const

export interface MorphoVault {
  address:        string
  name:           string
  symbol:         string
  assetSymbol:    string
  assetAddress:   string
  totalAssets:    number
  exchangeRate:   number
  supplyAPY:      number
  performanceFee: number
  curator:        string
  supplyMarkets:  string[]
  protocol:       'morpho'
}

async function discoverVaults(maxVaults: number, listedOnly: boolean): Promise<`0x${string}`[]> {
  const query = `{
    vaultV2s(first: ${maxVaults}, where: { chainId_in: [${MONAD_CHAIN_ID}] }) {
      items { address listed }
    }
  }`
  try {
    const res = await fetch(MORPHO_API, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ query }),
    })
    if (!res.ok) return []
    const { data } = await res.json() as { data?: { vaultV2s?: { items?: { address: string; listed: boolean }[] } } }
    const items = data?.vaultV2s?.items ?? []
    return items
      .filter(v => !listedOnly || v.listed)
      .map(v => v.address as `0x${string}`)
  } catch {
    return []
  }
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
 * Discovers and returns all active MetaMorpho vaults on Monad via the Morpho GraphQL API,
 * then enriches each with on-chain data (APY, TVL, exchange rate, curator, supply markets).
 *
 * @param maxVaults  - Maximum number of vaults to inspect (default 50)
 * @param listedOnly - Only return vaults marked as listed in the Morpho registry (default true)
 * @returns Array of {@link MorphoVault} sorted descending by `totalAssets`; zero-TVL vaults excluded
 *
 * @example
 * ```typescript
 * const vaults = await getMorphoVaults()
 * // → [{ name: 'Hyperithm USDC Apex', assetSymbol: 'USDC', totalAssets: 15200000, supplyAPY: 0.04 }]
 * ```
 *
 * @category Lending
 */
export async function getMorphoVaults(maxVaults = 50, listedOnly = true): Promise<MorphoVault[]> {
  const addresses = await discoverVaults(maxVaults, listedOnly)
  if (addresses.length === 0) return []

  const results = await Promise.allSettled(
    addresses.map(async (vault) => {
      const [name, symbol, assetAddr, fee, curatorAddr, queueLen] = await Promise.all([
        publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'name' }),
        publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'symbol' }),
        publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'asset' }),
        publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'fee' }).catch(() => 0n),
        publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'curator' }).catch(() => null),
        publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'supplyQueueLength' }).catch(() => 0n),
      ])
      const qLen = Number(queueLen as bigint)
      const supplyMarkets: string[] = qLen > 0
        ? (await Promise.allSettled(
            Array.from({ length: Math.min(qLen, 10) }, (_, i) =>
              publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'supplyQueue', args: [BigInt(i)] })
            )
          )).filter(r => r.status === 'fulfilled').map(r => (r as PromiseFulfilledResult<`0x${string}`>).value as string)
        : []
      const asset = assetAddr as `0x${string}`
      const [assetSym, assetDec, totalAssetsRaw, exchangeRaw, supplyAPY] = await Promise.all([
        publicClient.readContract({ address: asset, abi: ERC20_ABI, functionName: 'symbol' }),
        publicClient.readContract({ address: asset, abi: ERC20_ABI, functionName: 'decimals' }),
        publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'totalAssets' }),
        publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'convertToAssets', args: [1_000_000_000_000_000_000n] }),
        calcVaultAPY(vault),
      ])
      const dec     = Number(assetDec)
      const divisor = 10n ** BigInt(dec)
      const ta      = Number((totalAssetsRaw as bigint) / divisor)
      if (ta === 0) return null
      return {
        address:        vault,
        name:           name as string,
        symbol:         symbol as string,
        assetSymbol:    assetSym as string,
        assetAddress:   asset,
        totalAssets:    ta,
        exchangeRate:   Number(exchangeRaw as bigint) / 10 ** dec,
        supplyAPY,
        performanceFee: Number(fee as bigint) / 1e18,
        curator:        curatorAddr as string ?? '',
        supplyMarkets,
        protocol:       'morpho' as const,
      }
    }),
  )

  return results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => (r as PromiseFulfilledResult<MorphoVault>).value)
    .sort((a, b) => b.totalAssets - a.totalAssets)
}

/**
 * Returns total USD value locked across all Morpho stablecoin vaults on Monad.
 *
 * @returns Total TVL in USD across stablecoin MetaMorpho vaults
 *
 * @example
 * ```typescript
 * const tvl = await getMorphoTVL()
 * // → 30600000
 * ```
 *
 * @category Lending
 */
export async function getMorphoTVL(): Promise<number> {
  const vaults = await getMorphoVaults()
  return vaults
    .filter(v => ['USDC', 'USDT', 'AUSD', 'USDT0', 'USD1'].includes(v.assetSymbol))
    .reduce((s, v) => s + v.totalAssets, 0)
}

/**
 * Returns the MetaMorpho vault with the highest supply APY on Monad.
 *
 * @returns MorphoVault with the highest supplyAPY; throws if no vaults are found
 *
 * @example
 * ```typescript
 * const best = await getBestMorphoVault()
 * // → { name: 'AugustUSDCv2', supplyAPY: 0.058, totalAssets: 5700000, assetSymbol: 'USDC' }
 * ```
 *
 * @category Lending
 */
export async function getBestMorphoVault(): Promise<MorphoVault> {
  const vaults = await getMorphoVaults()
  if (vaults.length === 0) throw new Error('No Morpho vaults found on Monad')
  return [...vaults].sort((a, b) => b.supplyAPY - a.supplyAPY)[0]
}
