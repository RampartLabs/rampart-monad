/**
 * @module Morpho
 * @description MetaMorpho vault aggregator for Monad mainnet.
 * Discovers vaults via the MetaMorpho factory event log, computes supply APY
 * from on-chain exchange-rate deltas, and returns sorted vault metadata.
 *
 * **TVL:** ~$5M
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

export const MORPHO_BLUE:      `0x${string}` = '0xd5d960e8c380b724a48ac59e2dff1b2cb4a1eaee'
const METAMORPHO_FACTORY: `0x${string}` = '0xc1108c5d98dc09be44e656a9e34b04d37b90a50d'
const APR_BLOCK_DELTA = 72_000n

const FACTORY_EVENT_ABI = [{
  name: 'CreateMetaMorpho',
  type: 'event' as const,
  inputs: [
    { name: 'metaMorpho', type: 'address', indexed: true },
    { name: 'caller',     type: 'address', indexed: true },
    { name: 'initialOwner',     type: 'address',  indexed: false },
    { name: 'initialTimelock', type: 'uint256',   indexed: false },
    { name: 'asset',            type: 'address',  indexed: true },
    { name: 'name',             type: 'string',   indexed: false },
    { name: 'symbol',           type: 'string',   indexed: false },
    { name: 'salt',             type: 'bytes32',  indexed: false },
  ],
}] as const

const VAULT_ABI = [
  { name: 'asset',           type: 'function' as const, inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
  { name: 'name',            type: 'function' as const, inputs: [], outputs: [{ type: 'string'  }], stateMutability: 'view' as const },
  { name: 'symbol',          type: 'function' as const, inputs: [], outputs: [{ type: 'string'  }], stateMutability: 'view' as const },
  { name: 'totalAssets',     type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'convertToAssets', type: 'function' as const, inputs: [{ type: 'uint256', name: 'shares' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'fee',             type: 'function' as const, inputs: [], outputs: [{ type: 'uint96'  }], stateMutability: 'view' as const },
  { name: 'supplyQueueLength', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'supplyQueue',     type: 'function' as const, inputs: [{ type: 'uint256', name: 'index' }], outputs: [{ type: 'bytes32' }], stateMutability: 'view' as const },
  { name: 'curator',         type: 'function' as const, inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
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
  curator:        string        // address managing allocation strategy
  supplyMarkets:  string[]      // bytes32 market IDs this vault allocates to
  protocol:       'morpho'
}

async function discoverVaults(maxVaults: number): Promise<`0x${string}`[]> {
  try {
    const logs = await publicClient.getLogs({
      address: METAMORPHO_FACTORY,
      event:   FACTORY_EVENT_ABI[0],
      fromBlock: 1n,
      toBlock:   'latest',
    })
    return logs
      .map(l => (l.args as any).metaMorpho as `0x${string}`)
      .filter(Boolean)
      .slice(0, maxVaults)
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
 * Discovers and returns all active MetaMorpho vaults deployed on Monad, sorted by total assets.
 * Vault addresses are resolved from CreateMetaMorpho factory events starting at block 1.
 *
 * @param maxVaults - Maximum number of vaults to inspect (default 50)
 * @returns Array of MorphoVault sorted by totalAssets descending; empty vaults are excluded
 *
 * @example
 * ```typescript
 * const vaults = await getMorphoVaults(10)
 * // → [{ name: 'Gauntlet USDC', assetSymbol: 'USDC', totalAssets: 2500000, supplyAPY: 0.08 }]
 * ```
 *
 * @category Lending
 */
export async function getMorphoVaults(maxVaults = 50): Promise<MorphoVault[]> {
  const addresses = await discoverVaults(maxVaults)
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
      const dec      = Number(assetDec)
      const divisor  = 10n ** BigInt(dec)
      const ta       = Number((totalAssetsRaw as bigint) / divisor)
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
 * Only counts vaults with USDC, USDT, AUSD, or USDT0 as the underlying asset.
 *
 * @returns Total TVL in USD across all stablecoin MetaMorpho vaults
 *
 * @example
 * ```typescript
 * const tvl = await getMorphoTVL()
 * // → 4800000
 * ```
 *
 * @category Lending
 */
export async function getMorphoTVL(): Promise<number> {
  const vaults = await getMorphoVaults()
  return vaults
    .filter(v => ['USDC', 'USDT', 'AUSD', 'USDT0'].includes(v.assetSymbol))
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
 * // → { name: 'Gauntlet USDC', supplyAPY: 0.12, totalAssets: 2500000, assetSymbol: 'USDC' }
 * ```
 *
 * @category Lending
 */
export async function getBestMorphoVault(): Promise<MorphoVault> {
  const vaults = await getMorphoVaults()
  if (vaults.length === 0) throw new Error('No Morpho vaults found on Monad')
  return [...vaults].sort((a, b) => b.supplyAPY - a.supplyAPY)[0]
}
