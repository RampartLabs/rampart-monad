/**
 * @module Gearbox
 * @description Gearbox V3 leveraged lending pools on Monad Mainnet.
 * Credit pools are queried via a curated address list; APY is derived from
 * `baseInterestRate` (ray-per-second) scaled to annualised figures.
 *
 * **TVL:** ~$24M (USDC + AUSD + USDT0 pools, includes UltraYield by Edge vaults)
 * **Type:** Leveraged Lending (Gearbox V3)
 * **Docs:** https://docs.gearbox.finance
 *
 * Available functions:
 * - {@link getGearboxPools} — all Gearbox V3 credit pools with supply APY and TVL
 * - {@link getGearboxTVL} — total USD across all Gearbox pools
 */

import { publicClient } from '../chain'

const SECONDS_PER_YEAR = 31_536_000
const RAY_BIG = BigInt('1000000000000000000000000000')

function rayToNumber(ray: bigint): number {
  return Number(ray * 10000n / RAY_BIG) / 10000
}

const KNOWN_POOLS: { address: `0x${string}`; name: string }[] = [
  { address: '0x6b343f7b797f1488aa48c49d540690f2b2c89751', name: 'USDC Lending Pool' },
  { address: '0xc4173359087ce643235420b7bc610d9b0cf2b82d', name: 'AUSD Lending Pool' },
  { address: '0x164a35f31e4e0f6c45d500962a6978d2cbd5a16b', name: 'USDT0 Lending Pool' },
]

const POOL_ABI = [
  { name: 'totalAssets',         type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'totalBorrowed',       type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'baseInterestRate',    type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'supplyRate',          type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'underlyingToken',     type: 'function' as const, inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' as const },
  { name: 'availableLiquidity',  type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
] as const

const ERC20_ABI = [
  { name: 'symbol',   type: 'function' as const, inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' as const },
  { name: 'decimals', type: 'function' as const, inputs: [], outputs: [{ type: 'uint8'  }], stateMutability: 'view' as const },
] as const

export interface GearboxPool {
  address:            string
  name:               string
  assetSymbol:        string
  assetAddress:       string
  totalAssets:        number
  totalBorrows:       number
  availableLiquidity: number
  utilizationRate:    number
  borrowAPY:          number
  supplyAPY:          number
  protocol:           'gearbox'
}

/**
 * Returns Gearbox V3 credit pool stats including utilization, borrow APY, and supply APY.
 *
 * For each known pool, fetches `totalAssets`, `totalBorrowed`, `baseInterestRate`, and
 * `underlyingToken` via multicall. APY is computed as `(baseInterestRate / RAY) * SECONDS_PER_YEAR`.
 * Supply APY is borrow APY weighted by utilization rate.
 *
 * @returns Array of {@link GearboxPool} objects sorted descending by `totalAssets`
 *
 * @example
 * ```typescript
 * const pools = await getGearboxPools()
 * // → [{ name: 'USDC Lending Pool', supplyAPY: 0.082, utilizationRate: 0.74, ... }]
 * ```
 *
 * @category Lending
 */
export async function getGearboxPools(): Promise<GearboxPool[]> {
  const results = await Promise.allSettled(
    KNOWN_POOLS.map(async ({ address, name }) => {
      const calls = await publicClient.multicall({
        contracts: [
          { address, abi: POOL_ABI, functionName: 'totalAssets'        },
          { address, abi: POOL_ABI, functionName: 'totalBorrowed'      },
          { address, abi: POOL_ABI, functionName: 'baseInterestRate'   },
          { address, abi: POOL_ABI, functionName: 'supplyRate'         },
          { address, abi: POOL_ABI, functionName: 'underlyingToken'    },
          { address, abi: POOL_ABI, functionName: 'availableLiquidity' },
        ],
        allowFailure: true,
      })

      const totalAssetsRaw     = calls[0].status === 'success' ? (calls[0].result as bigint) : 0n
      const totalBorrowedRaw   = calls[1].status === 'success' ? (calls[1].result as bigint) : 0n
      const baseRateRaw        = calls[2].status === 'success' ? (calls[2].result as bigint) : 0n
      const supplyRateRaw      = calls[3].status === 'success' ? (calls[3].result as bigint) : null
      const underlyingAddr     = calls[4].status === 'success' ? (calls[4].result as `0x${string}`) : null
      const availLiqRaw        = calls[5].status === 'success' ? (calls[5].result as bigint) : 0n
      if (!underlyingAddr) return null

      const tokenCalls = await publicClient.multicall({
        contracts: [
          { address: underlyingAddr, abi: ERC20_ABI, functionName: 'symbol'   },
          { address: underlyingAddr, abi: ERC20_ABI, functionName: 'decimals' },
        ],
        allowFailure: true,
      })

      const assetSym = tokenCalls[0].status === 'success' ? (tokenCalls[0].result as string) : 'UNKNOWN'
      const assetDec = tokenCalls[1].status === 'success' ? Number(tokenCalls[1].result as number) : 18

      const divisor           = 10n ** BigInt(assetDec)
      const totalAssets       = Number(totalAssetsRaw  / divisor)
      const totalBorrows      = Number(totalBorrowedRaw / divisor)
      const availableLiqNum   = Number(availLiqRaw / divisor)
      const utilizationRate   = totalAssets > 0 ? totalBorrows / totalAssets : 0
      const borrowAPY         = rayToNumber(baseRateRaw) * SECONDS_PER_YEAR
      const supplyAPY         = supplyRateRaw !== null
        ? rayToNumber(supplyRateRaw) * SECONDS_PER_YEAR
        : borrowAPY * utilizationRate

      return {
        address,
        name,
        assetSymbol:        assetSym,
        assetAddress:       underlyingAddr,
        totalAssets,
        totalBorrows,
        availableLiquidity: availableLiqNum,
        utilizationRate,
        borrowAPY,
        supplyAPY,
        protocol: 'gearbox' as const,
      }
    }),
  )

  return results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => (r as PromiseFulfilledResult<GearboxPool>).value)
    .sort((a, b) => b.totalAssets - a.totalAssets)
}

/**
 * Returns total USD deposited across all Gearbox lending pools.
 *
 * Sums `totalAssets` (denominated in the pool's underlying token) from every
 * pool returned by {@link getGearboxPools}.
 *
 * @returns Total TVL in USD as a plain number
 *
 * @example
 * ```typescript
 * const tvl = await getGearboxTVL()
 * // → 24000000
 * ```
 *
 * @category Lending
 */
export async function getGearboxTVL(): Promise<number> {
  const pools = await getGearboxPools()
  return pools.reduce((s, p) => s + p.totalAssets, 0)
}
