/**
 * @module MuDigital
 * @description Mu Digital RWA protocol on Monad Mainnet.
 * Brings institutional Asian credit on-chain via two tranche tokens:
 * AZND (Asia Dollar, senior tranche, USD-pegged) and muBOND (junior tranche).
 * Users deposit AUSD to mint AZND or muBOND — no traditional ERC-4626 vault.
 * TVL is derived from the circulating supply of both tranche tokens.
 *
 * **TVL:** ~$13M
 * **Type:** RWA Lending / Structured Credit
 * **Docs:** https://docs.mudigital.net
 *
 * Available functions:
 * - {@link getMuDigitalStats} — AZND and muBOND supply, TVL breakdown
 * - {@link getMuDigitalTVL} — total USD locked across both tranches
 */

import { publicClient } from '../chain'

// Monad mainnet contract addresses (from docs.mudigital.net/technical-reference)
export const MU_DIGITAL_ADDRESSES = {
  AZND:   '0x4917a5ec9fCb5e10f47CBB197aBe6aB63be81fE8' as `0x${string}`,
  loAZND: '0x9c82eB49B51F7Dc61e22Ff347931CA32aDc6cd90' as `0x${string}`,
  muBOND: '0x336D414754967C6682B5A665C7DAF6F1409E63e8' as `0x${string}`,
} as const

const ERC20_ABI = [
  { name: 'totalSupply', type: 'function' as const, inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' as const },
  { name: 'decimals',    type: 'function' as const, inputs: [], outputs: [{ type: 'uint8'   }], stateMutability: 'view' as const },
  { name: 'symbol',      type: 'function' as const, inputs: [], outputs: [{ type: 'string'  }], stateMutability: 'view' as const },
] as const

export interface MuDigitalStats {
  protocol:      'mudigital'
  azndSupply:    number
  loAzndSupply:  number
  muBondSupply:  number
  tvlUSD:        number
}

/**
 * Returns Mu Digital tranche token supplies and total TVL on Monad.
 * AZND and loAZND are USD-pegged (1:1), muBOND is the junior tranche valued at par.
 *
 * @returns {@link MuDigitalStats} with supply breakdown and total TVL
 *
 * @example
 * ```typescript
 * const stats = await getMuDigitalStats()
 * // → { azndSupply: 10000000, muBondSupply: 3200000, tvlUSD: 13200000 }
 * ```
 *
 * @category Lending
 */
export async function getMuDigitalStats(): Promise<MuDigitalStats> {
  try {
    const results = await Promise.allSettled([
      publicClient.multicall({
        contracts: [
          { address: MU_DIGITAL_ADDRESSES.AZND,   abi: ERC20_ABI, functionName: 'totalSupply' },
          { address: MU_DIGITAL_ADDRESSES.AZND,   abi: ERC20_ABI, functionName: 'decimals'    },
          { address: MU_DIGITAL_ADDRESSES.loAZND, abi: ERC20_ABI, functionName: 'totalSupply' },
          { address: MU_DIGITAL_ADDRESSES.loAZND, abi: ERC20_ABI, functionName: 'decimals'    },
          { address: MU_DIGITAL_ADDRESSES.muBOND, abi: ERC20_ABI, functionName: 'totalSupply' },
          { address: MU_DIGITAL_ADDRESSES.muBOND, abi: ERC20_ABI, functionName: 'decimals'    },
        ],
        allowFailure: true,
      }),
    ])

    if (results[0].status !== 'fulfilled') {
      return { protocol: 'mudigital', azndSupply: 0, loAzndSupply: 0, muBondSupply: 0, tvlUSD: 0 }
    }

    const calls = results[0].value
    const azndRaw    = calls[0].status === 'success' ? (calls[0].result as bigint) : 0n
    const azndDec    = calls[1].status === 'success' ? Number(calls[1].result as number) : 6
    const loAzndRaw  = calls[2].status === 'success' ? (calls[2].result as bigint) : 0n
    const loAzndDec  = calls[3].status === 'success' ? Number(calls[3].result as number) : 6
    const muBondRaw  = calls[4].status === 'success' ? (calls[4].result as bigint) : 0n
    const muBondDec  = calls[5].status === 'success' ? Number(calls[5].result as number) : 6

    const azndSupply   = Number(azndRaw)   / 10 ** azndDec
    const loAzndSupply = Number(loAzndRaw) / 10 ** loAzndDec
    const muBondSupply = Number(muBondRaw) / 10 ** muBondDec

    // AZND + loAZND are USD-pegged; muBOND is valued at par (deposit asset = AUSD)
    const tvlUSD = azndSupply + loAzndSupply + muBondSupply

    return { protocol: 'mudigital', azndSupply, loAzndSupply, muBondSupply, tvlUSD }
  } catch {
    return { protocol: 'mudigital', azndSupply: 0, loAzndSupply: 0, muBondSupply: 0, tvlUSD: 0 }
  }
}

/**
 * Returns total USD value locked in Mu Digital on Monad.
 *
 * @returns TVL in USD
 *
 * @example
 * ```typescript
 * const tvl = await getMuDigitalTVL()
 * // → 13200000
 * ```
 *
 * @category Lending
 */
export async function getMuDigitalTVL(): Promise<number> {
  const stats = await getMuDigitalStats()
  return stats.tvlUSD
}
