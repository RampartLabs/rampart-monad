# rampart-monad

## Що це

npm SDK — агрегатор 55+ DeFi протоколів Monad mainnet (ChainID 143).
Публічний пакет: `npm install rampart-monad` (v0.1.0).
106/106 тестів. $800M+ TVL покрито.

3 шари:
- **Layer 1 — Functions** (`src/protocols/*`) — прямі функції для кожного протоколу
- **Layer 2 — Rampart class** (`src/client.ts`) — агрегований клієнт
- **Layer 3 — RampartAgent** (`src/agent.ts`) — 41 AI-інструмент для Vercel AI SDK

## Технічний стек

- TypeScript 6, tsup (build: ESM + CJS + DTS)
- viem ^2 (chain: monad, ChainID 143, rpc.monad.xyz)
- ai ^6 (Vercel AI SDK, для RampartAgent)
- zod ^4
- vitest (тести)
- Peer deps: viem, ai, zod

## Структура src/

```
chain.ts          — publicClient, wsClient, константи (MONAD_BLOCK_TIME_MS=400)
index.ts          — всі публічні експорти (фази 1–25+)
client.ts         — клас Rampart
agent.ts          — клас RampartAgent, 41 AI tool
protocols/        — по одному файлу на протокол
aggregators/      — router.ts (multi-DEX), market.ts (TVL, yields)
realtime/         — envio.ts (subscribeToSwaps, subscribeToNewBlocks)
tools/            — допоміжні утиліти для AI tools
types/            — спільні TypeScript типи
```

Ключові протоколи: kuru, uniswap, apriori, neverland, euler, morpho, curve, balancer, gearbox, clober, upshift, pancakeswap, lfj, curvance, perps, nadfun, oracles, staking, portfolio.

## Правила розробки

- **Без моків** — тести б'ють живий Monad Mainnet, завжди
- **Graceful fallback** — кожна функція повертає `[]` або `null` при помилці, ніколи не кидає
- **BigInt precision** — ділення в BigInt просторі перед `Number()` для 18-decimal токенів
- **Єдине джерело правди** — адреси контрактів не дублюються між файлами
- **Без коментарів** — тільки якщо логіка справді неочевидна
- Нова фаза = новий файл у `protocols/`, експорт у `index.ts`, тест у `tests/`

## Команди

```bash
npm install
npm test          # 106 тестів live проти mainnet
npm run build     # dist/: ESM + CJS + DTS
npm run typecheck
```

## Як пов'язаний з іншими

- **rampart-api** — імпортує цей пакет як npm dependency (`rampart-monad: ^0.1.0`)
- **rampart-docs** — документує цей SDK (Mintlify MDX)
- **rampart-site** — landing page посилається на npm і docs
- **rampart-chainlens** — незалежний, цей SDK не використовує

## Git

```
user.name  = 0xNickyTan
user.email = m225dw@gmail.com
SSH host   = github-rampart  (для RampartLabs організації)
remote     = git@github-rampart:RampartLabs/rampart-monad.git
```

Всі коміти та пуші тільки від `0xNickyTan`. Інший акаунт не використовувати.

## Поточний статус

Опублікований, активний. v0.1.0 на npm. 106 тестів проходять.
Додаються нові протоколи фазами (зараз 25+ фаз).
