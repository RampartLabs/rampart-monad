/**
 * @module Clober
 * @description Clober V2 central limit order book (CLOB) DEX on Monad Mainnet.
 * Book IDs are deterministically computed from the BookKey struct (base, quote,
 * unitSize, makerPolicy, hooks, takerPolicy) and verified against the BookManager
 * contract on-chain.
 *
 * **TVL:** ~$300K
 * **Type:** CLOB DEX (Clober V2)
 * **Docs:** https://docs.clober.io
 *
 * Available functions:
 * - {@link getCloberBooks} — all known Clober V2 order books on Monad
 * - {@link getCloberBookById} — single order book by computed book ID
 */

import { publicClient }       from '../chain'
import { keccak256, encodeAbiParameters } from 'viem'

const BOOK_MANAGER: `0x${string}` = '0x6657d192273731c3cac646cc82d5f28d0cbe8ccc'

const WMON_ADDR  = '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A' as `0x${string}`
const USDC_ADDR  = '0x754704Bc059F8C67012fEd69BC8A327a5aafb603' as `0x${string}`
const AUSD_ADDR  = '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a' as `0x${string}`

const MONAD_UNIT_SIZE   = 1_000_000n
const MONAD_MAKER_POLICY = 8_888_608
const MONAD_TAKER_POLICY = 8_888_708
const ZERO_HOOKS        = '0x0000000000000000000000000000000000000000' as `0x${string}`

const BOOK_MANAGER_ABI = [
  { name: 'getBookKey', type: 'function' as const,
    inputs:  [{ name: 'id', type: 'bytes32' }],
    outputs: [{ type: 'tuple', components: [
      { name: 'base',        type: 'address' },
      { name: 'unitSize',    type: 'uint64'  },
      { name: 'quote',       type: 'address' },
      { name: 'makerPolicy', type: 'uint24'  },
      { name: 'hooks',       type: 'address' },
      { name: 'takerPolicy', type: 'uint24'  },
    ]}],
    stateMutability: 'view' as const },
  { name: 'isOpened', type: 'function' as const,
    inputs:  [{ name: 'id', type: 'bytes32' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view' as const },
  { name: 'isEmpty', type: 'function' as const,
    inputs:  [{ name: 'id', type: 'bytes32' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view' as const },
] as const

export interface CloberBook {
  bookId:       string
  baseToken:    string
  quoteToken:   string
  isOpened:     boolean
  isEmpty:      boolean
  makerFeeBps:  number
  takerFeeBps:  number
  protocol:     'clober'
}

function computeBookId(base: `0x${string}`, quote: `0x${string}`): `0x${string}` {
  return keccak256(encodeAbiParameters(
    [
      { type: 'address', name: 'base'        },
      { type: 'uint64',  name: 'unitSize'    },
      { type: 'address', name: 'quote'       },
      { type: 'uint24',  name: 'makerPolicy' },
      { type: 'address', name: 'hooks'       },
      { type: 'uint24',  name: 'takerPolicy' },
    ],
    [base, MONAD_UNIT_SIZE, quote, MONAD_MAKER_POLICY, ZERO_HOOKS, MONAD_TAKER_POLICY],
  ))
}

function decodePolicyBps(policy: number): number {
  return Math.abs((policy & 0x7FFFFF) - 500_000) / 100
}

const KNOWN_PAIRS: [string, `0x${string}`, `0x${string}`][] = [
  ['WMON/USDC', WMON_ADDR, USDC_ADDR],
  ['WMON/AUSD', WMON_ADDR, AUSD_ADDR],
  ['USDC/AUSD', USDC_ADDR, AUSD_ADDR],
]

/**
 * Returns all known Clober V2 order books on Monad with their open/empty status and fee tiers.
 *
 * Iterates over `KNOWN_PAIRS` (WMON/USDC, WMON/AUSD, USDC/AUSD), computes each book ID
 * deterministically, then delegates to {@link getCloberBookById} for on-chain verification.
 *
 * @returns Array of {@link CloberBook} objects for every successfully resolved order book
 *
 * @example
 * ```typescript
 * const books = await getCloberBooks()
 * // → [{ bookId: '0x...', baseToken: '0x3bd3...', quoteToken: '0x7547...', isOpened: true, ... }]
 * ```
 *
 * @category DEX
 */
export async function getCloberBooks(): Promise<CloberBook[]> {
  const results = await Promise.allSettled(
    KNOWN_PAIRS.map(async ([, base, quote]) => {
      const bookId = computeBookId(base, quote)
      return getCloberBookById(bookId)
    }),
  )
  return results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => (r as PromiseFulfilledResult<CloberBook | null>).value!)
}

/**
 * Returns a single Clober V2 order book by its computed book ID, or null if not found.
 *
 * Calls `getBookKey`, `isOpened`, and `isEmpty` on the BookManager via multicall.
 * Maker and taker fee rates are decoded from the packed policy integers.
 *
 * @param bookId - keccak256 hash of the BookKey struct (use `computeBookId` or supply a known ID)
 * @returns A {@link CloberBook} object, or `null` if the book does not exist on-chain
 *
 * @example
 * ```typescript
 * const book = await getCloberBookById('0xabc123...')
 * // → { bookId: '0xabc123...', isOpened: true, makerFeeBps: 0.1, takerFeeBps: 0.5, ... }
 * // or null if not found
 * ```
 *
 * @category DEX
 */
export async function getCloberBookById(bookId: string): Promise<CloberBook | null> {
  try {
    const id = bookId as `0x${string}`
    const calls = await publicClient.multicall({
      contracts: [
        { address: BOOK_MANAGER, abi: BOOK_MANAGER_ABI, functionName: 'getBookKey', args: [id] },
        { address: BOOK_MANAGER, abi: BOOK_MANAGER_ABI, functionName: 'isOpened',   args: [id] },
        { address: BOOK_MANAGER, abi: BOOK_MANAGER_ABI, functionName: 'isEmpty',    args: [id] },
      ],
      allowFailure: true,
    })

    const key      = calls[0].status === 'success' ? (calls[0].result as any) : null
    const isOpened = calls[1].status === 'success' ? (calls[1].result as boolean) : false
    const isEmpty  = calls[2].status === 'success' ? (calls[2].result as boolean) : true
    if (!key) return null

    return {
      bookId,
      baseToken:   key.base  as string,
      quoteToken:  key.quote as string,
      isOpened,
      isEmpty,
      makerFeeBps: decodePolicyBps(Number(key.makerPolicy)),
      takerFeeBps: decodePolicyBps(Number(key.takerPolicy)),
      protocol:    'clober' as const,
    }
  } catch {
    return null
  }
}
