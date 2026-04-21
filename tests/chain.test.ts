import { describe, it, expect } from 'vitest'
import { publicClient, MONAD_CHAIN_ID } from '../src/chain'

describe('Chain config', () => {
  it('connects to Monad mainnet with correct chain ID', async () => {
    const chainId = await publicClient.getChainId()
    expect(chainId).toBe(MONAD_CHAIN_ID) // 143
  })

  it('returns a recent block number', async () => {
    const block = await publicClient.getBlockNumber()
    expect(block).toBeGreaterThan(60_000_000n) // mainnet is at ~68M+
  })

  it('multicall3 contract is deployed', async () => {
    const code = await publicClient.getCode({
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    })
    expect(code).toBeDefined()
    expect(code).not.toBe('0x')
  })
})
