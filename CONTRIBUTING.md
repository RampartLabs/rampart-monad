# Contributing to Rampart

## Adding a New Protocol

### 1. Create the protocol file

```
src/protocols/yourprotocol.ts
```

Minimal structure:
```typescript
import { publicClient } from '../chain'

const CONTRACT: `0x${string}` = '0xYourContractAddress'

const ABI = [
  { name: 'yourFunction', type: 'function' as const,
    inputs: [], outputs: [{ type: 'uint256' }],
    stateMutability: 'view' as const },
] as const

export interface YourProtocol {
  address:  string
  tvlUSD:   number
  protocol: 'yourprotocol'
}

export async function getYourProtocolData(): Promise<YourProtocol[]> {
  try {
    const result = await publicClient.readContract({
      address: CONTRACT, abi: ABI, functionName: 'yourFunction',
    })
    // ... parse and return
  } catch {
    return []
  }
}
```

### 2. Export from index.ts

```typescript
// src/index.ts
export { getYourProtocolData } from './protocols/yourprotocol'
export type { YourProtocol } from './protocols/yourprotocol'
```

### 3. Add tests

```
tests/yourprotocol.test.ts
```

```typescript
import { describe, it, expect } from 'vitest'
import { getYourProtocolData } from '../src/protocols/yourprotocol'

describe('YourProtocol', () => {
  it('returns array', async () => {
    const data = await getYourProtocolData()
    expect(Array.isArray(data)).toBe(true)
  }, 30_000)
})
```

### 4. Verify

```bash
npm run typecheck
npm run build
npm test
```

All 3 must pass before submitting.

## Rules

- **No mocking** — tests hit live Monad Mainnet
- **Graceful fallback** — every function returns `[]` or `null` on error, never throws to the caller
- **BigInt precision** — divide in BigInt space before `Number()` for 18-decimal tokens
- **Single source of truth** — don't duplicate contract addresses across files
- **No comments** unless the logic is genuinely non-obvious

## Finding Contract Addresses

1. Check `https://github.com/monad-crypto/protocols` — official registry
2. Check protocol's own docs
3. Search MonadVision explorer: `https://monadvision.io`
4. DefiLlama adapters: `https://github.com/DefiLlama/DefiLlama-Adapters`
