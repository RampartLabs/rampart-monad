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
 * - {@link getCloberTVL} — total USD locked across all Clober books
 * - {@link getCloberBestBid} — best bid tick and price for a given book
 * - {@link getCloberBestAsk} — best ask tick and price for a given book
 */

import { publicClient }       from '../chain'
import { keccak256, encodeAbiParameters, parseAbiItem } from 'viem'
import { getVerifiedPrice }   from './oracles'

const BOOK_MANAGER: `0x${string}` = '0x6657d192273731c3cac646cc82d5f28d0cbe8ccc'

const WMON_ADDR  = '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A' as `0x${string}`
const USDC_ADDR  = '0x754704Bc059F8C67012fEd69BC8A327a5aafb603' as `0x${string}`
const AUSD_ADDR  = '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a' as `0x${string}`

const MONAD_UNIT_SIZE    = 1_000_000n
const MONAD_MAKER_POLICY = 8_888_608
const MONAD_TAKER_POLICY = 8_888_708
const ZERO_HOOKS         = '0x0000000000000000000000000000000000000000' as `0x${string}`

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
  { name: 'getHighest', type: 'function' as const,
    inputs:  [{ name: 'id', type: 'bytes32' }],
    outputs: [{ type: 'int24' }],
    stateMutability: 'view' as const },
  { name: 'reservesOf', type: 'function' as const,
    inputs:  [{ name: 'currency', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view' as const },
] as const

const ERC20_ABI = [
  { name: 'symbol',   type: 'function' as const, inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' as const },
  { name: 'decimals', type: 'function' as const, inputs: [], outputs: [{ type: 'uint8'  }], stateMutability: 'view' as const },
] as const

export interface CloberBook {
  bookId:          string
  baseToken:       string
  quoteToken:      string
  baseSymbol:      string
  quoteSymbol:     string
  isOpened:        boolean
  isEmpty:         boolean
  makerFeeBps:     number
  takerFeeBps:     number
  protocol:        'clober'
}

export interface CloberBestPrice {
  bookId: string
  tick:   number
  price:  number
}

const symbolCache = new Map<string, string>()

async function resolveSymbol(addr: string): Promise<string> {
  const key = addr.toLowerCase()
  if (symbolCache.has(key)) return symbolCache.get(key)!
  try {
    const sym = await publicClient.readContract({
      address: addr as `0x${string}`, abi: ERC20_ABI, functionName: 'symbol',
    }) as string
    symbolCache.set(key, sym)
    return sym
  } catch {
    symbolCache.set(key, 'UNKNOWN')
    return 'UNKNOWN'
  }
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

/**
 * Converts a Clober tick to a price.
 * Price = 1.0001^tick (standard tick-based price encoding).
 */
function tickToPrice(tick: number): number {
  return Math.pow(1.0001, tick)
}

const KNOWN_PAIRS: [string, `0x${string}`, `0x${string}`][] = [
  ['WMON/USDC', WMON_ADDR, USDC_ADDR],
  ['WMON/AUSD', WMON_ADDR, AUSD_ADDR],
  ['USDC/AUSD', USDC_ADDR, AUSD_ADDR],
]

const BOOK_OPENED_EVENT = parseAbiItem(
  'event BookOpened(bytes32 indexed id, address indexed base, uint64 unitSize, address indexed quote, uint24 makerPolicy, address hooks, uint24 takerPolicy)'
)

async function discoverBooksFromEvents(): Promise<{ base: `0x${string}`; quote: `0x${string}` }[]> {
  try {
    const latestBlock = await publicClient.getBlockNumber()
    const fromBlock = latestBlock > 500_000n ? latestBlock - 500_000n : 0n
    const logs = await publicClient.getLogs({
      address:   BOOK_MANAGER,
      event:     BOOK_OPENED_EVENT,
      fromBlock,
      toBlock:   latestBlock,
    })
    return logs.map(log => ({
      base:  log.args.base  as `0x${string}`,
      quote: log.args.quote as `0x${string}`,
    }))
  } catch {
    return []
  }
}

/**
 * Returns all known Clober V2 order books on Monad.
 * Combines KNOWN_PAIRS with dynamically discovered books from BookOpened events
 * (last 500,000 blocks). Deduplicates by book ID.
 *
 * @returns Array of {@link CloberBook} objects for every successfully resolved order book
 *
 * @category DEX
 */
export async function getCloberBooks(): Promise<CloberBook[]> {
  const discovered = await discoverBooksFromEvents()

  const seenIds = new Set<string>()
  const allPairs: { base: `0x${string}`; quote: `0x${string}` }[] = []

  for (const [, base, quote] of KNOWN_PAIRS) {
    const id = computeBookId(base, quote)
    if (!seenIds.has(id)) { seenIds.add(id); allPairs.push({ base, quote }) }
  }
  for (const { base, quote } of discovered) {
    if (!base || !quote) continue
    const id = computeBookId(base, quote)
    if (!seenIds.has(id)) { seenIds.add(id); allPairs.push({ base, quote }) }
  }

  const results = await Promise.allSettled(
    allPairs.map(async ({ base, quote }) => {
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
 * @param bookId - keccak256 hash of the BookKey struct
 * @returns A {@link CloberBook} object, or `null` if the book does not exist on-chain
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

    const [baseSymbol, quoteSymbol] = await Promise.all([
      resolveSymbol(key.base  as string),
      resolveSymbol(key.quote as string),
    ])

    return {
      bookId,
      baseToken:   key.base  as string,
      quoteToken:  key.quote as string,
      baseSymbol,
      quoteSymbol,
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

/**
 * Returns the best bid (highest buy) tick and price for a Clober order book.
 * Uses `getHighest(bookId)` from BookManager.
 *
 * @param bookId - The book ID (bytes32 hex string)
 * @returns Best bid tick and price, or null if book is empty / call fails
 *
 * @category DEX
 */
export async function getCloberBestBid(bookId: string): Promise<CloberBestPrice | null> {
  try {
    const tick = await publicClient.readContract({
      address:      BOOK_MANAGER,
      abi:          BOOK_MANAGER_ABI,
      functionName: 'getHighest',
      args:         [bookId as `0x${string}`],
    }) as number
    return { bookId, tick: Number(tick), price: tickToPrice(Number(tick)) }
  } catch {
    return null
  }
}

/**
 * Returns the best ask (lowest sell) tick and price for a Clober order book.
 * Clober stores asks as the inverse book: the best ask is the highest tick of the
 * flipped book (quote→base). This approximates the ask by negating the best bid tick
 * of the same book — callers should use the bid/ask spread for price discovery.
 *
 * @param bookId - The book ID (bytes32 hex string)
 * @returns Best ask tick and price, or null if book is empty / call fails
 *
 * @category DEX
 */
export async function getCloberBestAsk(bookId: string): Promise<CloberBestPrice | null> {
  const bid = await getCloberBestBid(bookId)
  if (!bid) return null
  const askTick = -bid.tick
  return { bookId, tick: askTick, price: tickToPrice(askTick) }
}

/**
 * Returns total USD value locked across all Clober books by summing
 * `reservesOf(currency)` for each unique currency, priced via the oracle aggregator.
 *
 * @returns Total TVL in USD
 *
 * @category DEX
 */
export async function getCloberTVL(): Promise<number> {
  try {
    const books = await getCloberBooks()
    const currencies = new Set<string>()
    for (const book of books) {
      currencies.add(book.baseToken.toLowerCase())
      currencies.add(book.quoteToken.toLowerCase())
    }

    let tvl = 0
    for (const currency of currencies) {
      const [reserveRaw, decimalsRaw, sym] = await Promise.all([
        publicClient.readContract({
          address: BOOK_MANAGER, abi: BOOK_MANAGER_ABI,
          functionName: 'reservesOf', args: [currency as `0x${string}`],
        }).catch(() => null),
        publicClient.readContract({
          address: currency as `0x${string}`, abi: ERC20_ABI, functionName: 'decimals',
        }).catch(() => null),
        resolveSymbol(currency),
      ])

      if (reserveRaw === null) continue
      const decimals = decimalsRaw !== null ? Number(decimalsRaw) : 18
      const amount = Number(BigInt(reserveRaw as any) * 10n ** BigInt(18 - decimals)) / 1e18
      if (amount === 0) continue

      const priceData = await getVerifiedPrice(sym).catch(() => null)
      const price = priceData?.bestPrice ?? null
      if (price !== null) tvl += amount * price
    }

    return tvl
  } catch {
    return 0
  }
}
