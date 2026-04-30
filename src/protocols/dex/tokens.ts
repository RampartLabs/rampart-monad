// ============================================================
// Rampart SDK — Token Registry (Monad Mainnet)
// Source: https://github.com/monad-crypto/token-list (official)
// ============================================================

export interface TokenInfo {
  symbol:   string
  address:  `0x${string}`
  decimals: number
}

export const TOKENS: Record<string, TokenInfo> = {
  MON:     { symbol: 'MON',     address: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', decimals: 18 },
  WMON:    { symbol: 'WMON',    address: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', decimals: 18 },
  AUSD:    { symbol: 'AUSD',    address: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a', decimals: 6  },
  USDC:    { symbol: 'USDC',    address: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', decimals: 6  },
  USDT0:   { symbol: 'USDT0',   address: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', decimals: 6  },
  WETH:    { symbol: 'WETH',    address: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', decimals: 18 },
  WBTC:    { symbol: 'WBTC',    address: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', decimals: 8  },
  aprMON:  { symbol: 'aprMON',  address: '0x0c65A0BC65a5D819235B71F554D210D3F80E0852', decimals: 18 },
  sMON:    { symbol: 'sMON',    address: '0xA3227C5969757783154C60bF0bC1944180ed81B9', decimals: 18 },
  gMON:    { symbol: 'gMON',    address: '0x8498312A6B3CbD158bf0c93AbdCF29E6e4F55081', decimals: 18 },
  shMON:   { symbol: 'shMON',   address: '0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c', decimals: 18 },
}

export function getToken(symbol: string): TokenInfo {
  const t = TOKENS[symbol.toUpperCase()] ?? TOKENS[symbol]
  if (!t) throw new Error(`Unknown token: ${symbol}. Known: ${Object.keys(TOKENS).join(', ')}`)
  return t
}

export function getTokenByAddress(address: string): TokenInfo | undefined {
  return Object.values(TOKENS).find(t => t.address.toLowerCase() === address.toLowerCase())
}
