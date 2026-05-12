# @rampartlabs/celestia SDK — Design Spec

date: 2026-05-12
status: approved

## Що будуємо

TypeScript SDK для Celestia DA layer. npm пакет `@rampartlabs/celestia` — частина RampartLabs multi-chain екосистеми поряд з `rampart-monad`.

Дає розробникам простий TypeScript доступ до даних Celestia мережі без потреби розбиратись в інфраструктурі.

## Аудиторія

- **Validator operators** — моніторинг своєї ноди, uptime, missed blocks
- **Rollup teams** — blob submission, inclusion proofs, DA analytics
- **Developers / аналітики** — дані екосистеми, namespaces, rollup stats

## Архітектура

### Три шари (як rampart-monad)

**Layer 1 — Protocol Functions** (`src/sources/`)
Прямі функції до кожного джерела даних. Один файл на джерело.

**Layer 2 — CelestiaClient** (`src/client.ts`)
Клас з модулями. Вся логіка routing між джерелами всередині. Юзер не знає звідки дані.

**Layer 3 — CelestiaAgent** (`src/agent.ts`)
35+ AI інструментів для Vercel AI SDK. Аналог RampartAgent з rampart-monad.

### Підхід до конфігурації (Hybrid Configurable)

```typescript
// Default — публічні endpoints (Cosmos REST + Celenium free + Public DA)
const client = new CelestiaClient()

// З власним Light Node
const client = new CelestiaClient({
  nodeUrl: 'http://localhost:26658',
  jwt: process.env.CELESTIA_JWT,
  network: 'mocha'
})

// Повністю кастомний
const client = new CelestiaClient({
  nodeUrl: 'http://my-node:26658',
  jwt: process.env.CELESTIA_JWT,
  celeniumUrl: 'https://api.celenium.io/v1',
  cosmosRestUrl: 'https://api-celestia.kjnodes.com',
  network: 'mainnet'
})
```

### Джерела даних і routing

| Джерело | Що дає | Fallback |
|---------|--------|----------|
| Light Node (mainnet + mocha) | blob recent (~30d), DAS stats, blob.Submit | → Public DA |
| Public DA (ITRocket, Noders :26658) | historical blob data | → QuickNode |
| QuickNode / Alchemy | managed celestia-node JSON-RPC | — |
| Celenium API (free: 100k RPD / 3 RPS) | indexed stats, namespaces, rollups | retry 700ms/1400ms |
| Cosmos REST (kjnodes, polkachu) | validators, staking, governance | rotate providers |

Routing прозорий — юзер завжди викликає один метод, SDK вибирає джерело автоматично.

## SDK Модулі

### `client.validators`
```typescript
.getAll()                    // всі активні валідатори
.getByAddress(address)       // конкретний валідатор
.getUptime(address)          // % онлайн (uptime)
.getMissedBlocks(address)    // пропущені блоки
.getVotingPower()            // розподіл voting power
.getDelegations(address)     // делегації до валідатора
```
Джерело: Celenium + Cosmos REST

### `client.staking`
```typescript
.getAPR()                    // поточний APR стейкінгу
.getPool()                   // bonded / unbonded TIA
.getInflation()              // поточна інфляція
.getDelegations(address)     // делегації адреси
.getRewards(address)         // pending rewards
```
Джерело: Cosmos REST

### `client.blobs`
```typescript
.getStats()                  // загальна статистика blob'ів
.getByNamespace(ns)          // blob'и конкретного namespace
.getData(height, ns)         // raw вміст blob'а
.getDailyVolume()            // обсяг по днях
.submit(namespace, data)     // відправити blob ✍️ (потребує JWT)
```
Джерело: Light Node (recent) + Public DA (historical) + Celenium (stats)

### `client.da`
```typescript
.getSamplingStats()          // DAS health реалтайм
.getNamespaceData(ns, h)     // share-level дані
.isAvailable(height)         // чи доступний блок
.getProof(height, ns)        // inclusion proof для L2
```
Джерело: Light Node

### `client.namespaces`
```typescript
.getTop(limit?)              // топ namespace за обсягом
.getById(namespaceId)        // конкретний namespace
.getActivity(ns)             // активність по часу
.getMessages(ns, height)     // messages в namespace
```
Джерело: Celenium

### `client.network`
```typescript
.getHead()                   // останній блок
.getBlock(height)            // конкретний блок
.getTx(hash)                 // транзакція
.getStatus()                 // стан ноди
.getChainStats()             // загальна статистика
```
Джерело: CometBFT RPC + Light Node

### `client.rollups`
```typescript
.getAll()                    // всі rollup'и що використовують Celestia DA
.getStats(slug)              // DA обсяг конкретного rollup
.getTopBySize()              // топ по розміру даних
```
Джерело: Celenium

### `client.realtime`
```typescript
.subscribeBlocks(cb)         // новий блок
.subscribeBlobs(ns, cb)      // нові blob'и в namespace
.subscribeFraud(cb)          // fraud alerts (bad encoding)
```
Джерело: Light Node WebSocket

## Error Handling

- **Light Node timeout** → fallback до Public DA (ITRocket/Noders)
- **Public DA недоступний** → fallback до QuickNode/Alchemy
- **Celenium 429** → retry exponential: 700ms → 1400ms → 2800ms
- **Cosmos REST provider down** → rotate до наступного в списку
- Всі методи повертають `null` або `[]` при помилці, ніколи не кидають

## Структура файлів

```
src/
  client.ts              — CelestiaClient клас
  agent.ts               — CelestiaAgent, 35+ AI tools
  index.ts               — публічні експорти
  config.ts              — defaults, endpoint lists
  sources/
    celestia-node.ts     — Light Node JSON-RPC methods
    cosmos-rest.ts       — Cosmos REST methods
    cometbft.ts          — CometBFT RPC methods
    celenium.ts          — Celenium API methods
  modules/
    validators.ts
    staking.ts
    blobs.ts
    da.ts
    namespaces.ts
    network.ts
    rollups.ts
    realtime.ts
  types/
    index.ts             — спільні TypeScript типи
```

## Тестування

- Тести б'ють живий mainnet і mocha testnet (як в rampart-monad)
- Без моків — реальні дані
- Окремі тести для кожного модуля
- vitest

## Технічний стек

- TypeScript 6, tsup (ESM + CJS + DTS)
- Vercel AI SDK (для CelestiaAgent)
- zod (валідація)
- vitest (тести)
- Peer deps: ai, zod

## Мережі

- `mainnet` (default) — celestia mainnet
- `mocha` — testnet

## npm пакет

`@rampartlabs/celestia` — публічний, як `rampart-monad`

## Що НЕ входить у v1.0

- Self-hosted Celenium indexer — потребує Bridge Node, відкладено
- Blobstream proofs для EVM — складно без archival node, v1.1
- Governance voting (write) — v1.1
- state.Delegate/Undelegate (write) — v1.1
