import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,  // 30s per test for mainnet RPC calls
    hookTimeout: 30000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,  // run test files sequentially to avoid 429 from public RPC
      },
    },
  },
})
