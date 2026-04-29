/**
 * Protocol audit — checks every SDK protocol against Monad mainnet.
 * Run: npx tsx scripts/audit-protocols.ts
 *
 * Legend:
 *   ✅ LIVE       — contract has bytecode on-chain, read returns data
 *   ⚡ DEPLOYED   — bytecode exists but read returned 0 or reverted
 *   ❌ DEAD       — no bytecode at address (wrong address or not deployed)
 *   🌐 API        — relies on external HTTP API
 *   ⚠️  PRICE_SEED — TVL uses hardcoded price instead of live oracle
 */

import { createPublicClient, http } from 'viem'

const client = createPublicClient({
  transport: http('https://rpc.monad.xyz'),
  chain: {
    id: 143,
    name: 'Monad',
    nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
    rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
  },
})

// ── ANSI colours ───────────────────────────────────────────────
const C = {
  green:  (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red:    (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan:   (s: string) => `\x1b[36m${s}\x1b[0m`,
  grey:   (s: string) => `\x1b[90m${s}\x1b[0m`,
  bold:   (s: string) => `\x1b[1m${s}\x1b[0m`,
}

// ── Helpers ────────────────────────────────────────────────────
async function hasBytecode(addr: `0x${string}`): Promise<boolean> {
  try {
    const code = await client.getBytecode({ address: addr })
    return !!code && code !== '0x'
  } catch { return false }
}

async function readUint(addr: `0x${string}`, fn: string): Promise<bigint | null> {
  try {
    const r = await client.readContract({
      address: addr,
      abi: [{ name: fn, type: 'function', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' }] as const,
      functionName: fn,
    })
    return r as bigint
  } catch { return null }
}

// ── Protocol registry ──────────────────────────────────────────
// addr = main contract to check bytecode
// readFn = optional view function that should return non-zero if active
// api = uses external HTTP endpoint (no on-chain check)
// priceSeed = hardcoded price note
// note = extra context shown in output
interface Protocol {
  name:       string
  addr:       `0x${string}`
  readFn?:    string
  api?:       true
  priceSeed?: string
  note?:      string
}

const PROTOCOLS: Protocol[] = [
  // ── DEX / Orderbook ──────────────────────────────────────────
  {
    name: 'Kuru',
    addr: '0x0000000000000000000000000000000000000000',
    api:  true,
    note: 'REST API: exchange.kuru.io/api/v3',
  },
  {
    name: 'Uniswap (wrapper)',
    addr: '0x0000000000000000000000000000000000000000',
    api:  true,
    note: 'wraps Kuru API — Uniswap V4 not deployed on Monad yet',
  },
  {
    name: 'Uniswap V4',
    addr: '0x188d586ddcf52439676ca21a244753fa19f9ea8e',
  },
  {
    name: 'PancakeSwap V3',
    addr: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
    readFn: 'allPairsLength',
    note: 'V3 Factory — may revert on standard queries',
  },
  {
    name: 'LFJ (Trader Joe)',
    addr: '0xb43120c4745967fa9b93E79C149E66B0f2D6Fe0c',
    readFn: 'getNumberOfLBPairs',
  },
  {
    name: 'Clober V2',
    addr: '0x6657d192273731c3cac646cc82d5f28d0cbe8ccc',
    readFn: 'bookCount',
  },
  {
    name: 'Curve',
    addr: '0xe6dA14500f0b5783E2325F9C5a7eE5d99DA0fB42',
  },
  {
    name: 'Balancer V3',
    addr: '0xbA1333333333a1BA1108E8412f11850A5C319bA9',
  },
  {
    name: 'Bean Exchange',
    addr: '0x8Bb9727Ca742C146563DccBAFb9308A234e1d242',
  },
  {
    name: 'iZiSwap',
    addr: '0x8c7d3063579BdB0b90997e18A770eaE32E1eBb08',
  },
  {
    name: 'Capricorn (CL DEX)',
    addr: '0x6B5F564339DbAD6b780249827f2198a841FEB7F3',
  },
  {
    name: 'Pingu Exchange',
    addr: '0x631c6E0d5ae2E1F6a39871a9BE97F1D9d43D1C83',
  },
  {
    name: 'WooFi',
    addr: '0x5520385bFcf07Ec87C4c53A7d8d65595Dff69FA4',
  },
  {
    name: 'KyberSwap',
    addr: '0x0000000000000000000000000000000000000000',
    api:  true,
    note: 'API: aggregator-api.kyberswap.com/monad',
  },
  {
    name: 'OpenOcean',
    addr: '0x0000000000000000000000000000000000000000',
    api:  true,
    note: 'API: open-api.openocean.finance/v4/monad',
  },

  // ── Perps ─────────────────────────────────────────────────────
  {
    name: 'Perpl',
    addr: '0x34B6552d57a35a1D042CcAe1951BD1C370112a6F',
  },
  {
    name: 'Monday Trade',
    addr: '0xC1e98D0A2a58fB8aBd10ccc30a58efff4080Aa21',
  },

  // ── Lending ───────────────────────────────────────────────────
  {
    name: 'Euler V2',
    addr: '0xba4dd672062de8feedb665dd4410658864483f1e',
  },
  {
    name: 'Morpho Blue',
    addr: '0xd5d960e8c380b724a48ac59e2dff1b2cb4a1eaee',
    note: 'Morpho core — source: monad-crypto/protocols registry',
  },
  {
    name: 'MetaMorpho Factory',
    addr: '0xc1108c5d98dc09be44e656a9e34b04d37b90a50d',
    note: 'MetaMorpho VaultV2 factory — source: monad-crypto/protocols registry',
  },
  {
    name: 'Curvance',
    addr: '0x1310f352f1389969Ece6741671c4B919523912fF',
  },
  {
    name: 'Gearbox V3',
    addr: '0x6b343f7b797f1488aa48c49d540690f2b2c89751',
    readFn: 'totalSupply',
  },
  {
    name: 'Neverland',
    addr: '0x80f00661b13cc5f6ccd3885be7b4c9c67545d585',
    readFn: 'totalSupply',
  },
  {
    name: 'Folks Finance',
    addr: '0xc7bc4A43384f84B8FC937Ab58173Edab23a4c3cD',
    note: 'SpokeCommon — prices now from getVerifiedPrice oracle',
  },
  {
    name: 'Sumer Money',
    addr: '0x2d9b96648C784906253c7FA94817437EF59Cf226',
    note: 'Comptroller — ETH/BTC prices now from getVerifiedPrice oracle',
  },
  {
    name: 'TownSquare (MON Pool)',
    addr: '0x106d0e2bff74b39d09636bdcd5d4189f24d91433',
    readFn: 'totalSupply',
    note: 'Hub: 0x2dfdb4bf...  MON pool token (tsMON)',
  },
  {
    name: 'Timeswap',
    addr: '0x9515507fC36174e0BAbac382B6640ef2325E61da',
    readFn: 'numberOfPairs',
  },

  // ── Yield / Vaults ────────────────────────────────────────────
  {
    name: 'aPriori LST',
    addr: '0x0c65A0BC65a5D819235B71F554D210D3F80E0852',
    readFn: 'totalSupply',
  },
  {
    name: 'Renzo (ezETH)',
    addr: '0x2416092f143378750bb29b79eD961ab195CcEea5',
    readFn: 'totalAssets',
  },
  {
    name: 'Beefy (vaultFactory)',
    addr: '0x9818dF1Bdce8D0E79B982e2C3a93ac821b3c17e0',
  },
  {
    name: 'Upshift',
    addr: '0x36edbf0c834591bfdfcac0ef9605528c75c406aa',
    readFn: 'totalAssets',
  },
  {
    name: 'Mellow (vaultFactory)',
    addr: '0x04c0287DEdE16e0C04A1C2A52F31400a88f1dF4c',
  },
  {
    name: 'Lagoon (factory)',
    addr: '0xBf994c358f939011595AB4216AC005147863f9D6',
  },
  {
    name: 'Sherpa Finance',
    addr: '0x96043804D00DCeC238718EEDaD9ac10719778380',
    readFn: 'totalAssets',
  },
  {
    name: 'Accountable',
    addr: '0xf786154e56e5c88Ce984800dEa71B48EA4FFAbfE',
  },
  {
    name: 'LeverUp',
    addr: '0xea1b8E4aB7f14F7dCA68c5B214303B13078FC5ec',
    readFn: 'totalSupply',
  },
  {
    name: 'Enjoyoors',
    addr: '0x6B5E332387e8beC98C52F10A72952B17176B4f1b',
    readFn: 'totalAssets',
  },
  {
    name: 'Nabla Finance',
    addr: '0x610748f49774C062467c7AE1eC9E4729FFE94577',
  },
  {
    name: 'Multipli (xRWAUSDI)',
    addr: '0x0000000000000000000000000000000000000000',
    api:  true,
    note: 'address unverified — not in monad-crypto/protocols registry. Previous 0x754704 was USDC.',
  },
  {
    name: 'Covenant (CDP)',
    addr: '0x11A7Ab0A9D7bD531DBcF0f0630BF7167F8F198f6',
  },
  {
    name: 'Sablier',
    addr: '0x82723C1ffEc9D43dE5FA80b25Da8df99AfD470ba',
  },

  // ── Infra / Other ─────────────────────────────────────────────
  {
    name: 'NadFun',
    addr: '0xAd8887348E5d5d479156c851F4F4778e83a1DFE3',
  },
  {
    name: 'Skate Finance',
    addr: '0x430b6E7f7D43D70786267AF7a5B2C1831372ca24',
  },
  {
    name: 'Doppler (launchpad)',
    addr: '0xaa47d2977d622dbdfd33eef6a8276727c52eb4e5',
  },
]

// ── Runner ─────────────────────────────────────────────────────
type Status = 'LIVE' | 'DEPLOYED' | 'DEAD' | 'API' | 'PRICE_SEED'

interface Result {
  name:     string
  addr:     string
  status:   Status
  detail:   string
  note?:    string
  warning?: string
}

async function audit(p: Protocol): Promise<Result> {
  if (p.api) {
    return {
      name: p.name, addr: 'external API',
      status: 'API', detail: p.note ?? 'HTTP endpoint',
    }
  }

  const live = await hasBytecode(p.addr)
  if (!live) {
    return {
      name: p.name, addr: p.addr, status: 'DEAD',
      detail: 'no bytecode — contract not deployed or wrong address',
      note: p.note, warning: p.priceSeed,
    }
  }

  let status: Status = 'LIVE'
  let detail = 'bytecode ✓'

  if (p.readFn) {
    const val = await readUint(p.addr, p.readFn)
    if (val === null) {
      detail = `bytecode ✓ · ${p.readFn}() reverted (ABI mismatch or paused)`
      status = 'DEPLOYED'
    } else if (val === 0n) {
      detail = `bytecode ✓ · ${p.readFn}() = 0 (possibly inactive)`
      status = 'DEPLOYED'
    } else {
      detail = `bytecode ✓ · ${p.readFn}() = ${val.toLocaleString()}`
    }
  }

  if (p.priceSeed) status = 'PRICE_SEED'

  return { name: p.name, addr: p.addr, status, detail, note: p.note, warning: p.priceSeed }
}

function badge(s: Status): string {
  switch (s) {
    case 'LIVE':       return C.green('✅ LIVE      ')
    case 'DEPLOYED':   return C.yellow('⚡ DEPLOYED  ')
    case 'DEAD':       return C.red('❌ DEAD      ')
    case 'API':        return C.cyan('🌐 API       ')
    case 'PRICE_SEED': return C.yellow('⚠️  PRICE_SEED')
  }
}

async function main() {
  const start = Date.now()
  console.log('\n' + C.bold('═'.repeat(65)))
  console.log(C.bold('  Rampart SDK — Protocol Audit  ') + C.grey('(Monad Mainnet rpc.monad.xyz)'))
  console.log(C.bold('═'.repeat(65)) + '\n')
  console.log(C.grey('  Checking ' + PROTOCOLS.length + ' protocols in parallel...\n'))

  const results = await Promise.all(PROTOCOLS.map(audit))
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)

  for (const r of results) {
    const name  = C.bold(r.name.padEnd(22))
    const addr  = r.addr === 'external API'
      ? C.grey('  external API       ')
      : C.grey('  ' + r.addr.slice(0, 10) + '...' + r.addr.slice(-4))
    console.log(`  ${name}  ${badge(r.status)}  ${addr}`)
    console.log(`  ${''.padEnd(22)}  ${''.padEnd(13)}  ${C.grey(r.detail)}`)
    if (r.note)    console.log(`  ${''.padEnd(22)}  ${''.padEnd(13)}  ${C.cyan('ℹ ' + r.note)}`)
    if (r.warning) console.log(`  ${''.padEnd(22)}  ${''.padEnd(13)}  ${C.yellow('⚠ ' + r.warning)}`)
    console.log()
  }

  // ── Summary ──────────────────────────────────────────────────
  const live      = results.filter(r => r.status === 'LIVE').length
  const deployed  = results.filter(r => r.status === 'DEPLOYED').length
  const dead      = results.filter(r => r.status === 'DEAD').length
  const api       = results.filter(r => r.status === 'API').length
  const priceSeed = results.filter(r => r.status === 'PRICE_SEED').length

  console.log(C.bold('═'.repeat(65)))
  console.log(C.bold('  Summary') + C.grey(` (${elapsed}s)`))
  console.log(C.bold('─'.repeat(65)))
  console.log(`  ${C.green('✅ Live (bytecode + data):')}   ${live}`)
  console.log(`  ${C.yellow('⚡ Deployed but empty/stale:')} ${deployed}`)
  console.log(`  ${C.red('❌ Dead (no bytecode):')}       ${dead}`)
  console.log(`  ${C.cyan('🌐 External API:')}             ${api}`)
  console.log(`  ${C.yellow('⚠️  Hardcoded price seeds:')}    ${priceSeed}`)
  console.log(C.bold('═'.repeat(65)) + '\n')

  if (dead > 0) {
    console.log(C.red(C.bold('Dead — need address fix or removal:')))
    results.filter(r => r.status === 'DEAD').forEach(r =>
      console.log(`  ❌ ${r.name}  ${C.grey(r.addr)}`)
    )
    console.log()
  }

  if (deployed > 0) {
    console.log(C.yellow(C.bold('Deployed but returning 0/empty — possibly inactive:')))
    results.filter(r => r.status === 'DEPLOYED').forEach(r =>
      console.log(`  ⚡ ${r.name}  ${C.grey('— ' + r.detail)}`)
    )
    console.log()
  }

  if (priceSeed > 0) {
    console.log(C.yellow(C.bold('Price seed issues — TVL not from live oracle:')))
    results.filter(r => r.status === 'PRICE_SEED').forEach(r =>
      console.log(`  ⚠  ${r.name}: ${r.warning}`)
    )
    console.log()
  }

  if (api > 0) {
    console.log(C.cyan(C.bold('API-dependent (offline if endpoint unavailable):')))
    results.filter(r => r.status === 'API').forEach(r =>
      console.log(`  🌐 ${r.name}  ${C.grey('— ' + r.detail)}`)
    )
    console.log()
  }

  process.exit(dead > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
