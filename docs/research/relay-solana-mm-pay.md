# Research: Relay’s Solana quote, transaction, submission, and status contract

**Decision ticket:** CONF-1883 — “Verify Relay’s Solana quote, transaction, submission, and status contract”  
**Wayfinder:** “Wayfind non-EVM deposits for MetaMask Pay”  
**Evidence cutoff requested:** 2026-08-25  
**Method:** Official Relay documentation and live metadata APIs, Relay’s official SDK/SVM-adapter source, official MetaMask mUSD information, and the named local MetaMask source files. No production transaction was signed or submitted.

## Summary / answer

Relay supports Solana as an origin through the normal **`POST /quote/v2` → wallet signs and broadcasts the returned Solana transaction instructions → `POST /transactions/index` notification → `GET /intents/status/v3?requestId=…`** flow. For ordinary Solana-source quotes, **MetaMask—not Relay—must sign and submit the Solana deposit transaction**; Relay then detects/receives the deposit and its solver submits the destination fill. The gasless EVM-only `POST /execute` contract currently represented by MetaMask Pay is not the Solana submission contract.

The canonical requested route identifiers are:

| Role | Chain ID | Asset identifier | Decimals | Evidence status |
|---|---:|---|---:|---|
| Solana origin | `792703809` | native SOL: `11111111111111111111111111111111` | 9 | **Verified** in Relay’s Solana guide |
| Solana origin | `792703809` | SPL USDC mint: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | 6 | **Verified** |
| Arbitrum destination | `42161` | native USDC: `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | 6 | **Verified canonical identifier; route remains quote-time dynamic** |
| Polygon destination | `137` | bridged USDC.e: `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` | 6 | **Verified** in Relay’s live Chains API (`id: "usdc.e"`, `supportsBridging: true`) |
| Linea destination | `59144` | mUSD: `0xacA92E438df0B2401fF60dA7E4337B687a2435DA` | 6 | **Verified** by official MetaMask asset material and Relay’s current supported-routes listing |

Relay documents that Solana wallet and mint addresses are **case-sensitive**, that `user` is the Solana depositing/signing address, and that `recipient` is the destination EVM address for these routes. Relay says it supports native SOL and “any Solana token available on Jupiter”; successful route availability nevertheless depends on current solver/DEX liquidity, chain health, amount, and quote-time simulation. The requested three routes should therefore be treated as **supported candidates, not static guarantees**. A fresh successful quote for each exact asset/amount/account pair is the authoritative availability check.

**Decision:** proceed with a Solana-specific Relay quote/execution path, but do **not** extend the existing MetaMask Pay `RelayExecuteRequest` or assume its EVM transaction type can represent SVM steps. Gate implementation on Relay answering the provider questions below and on capturing sanitized successful `/quote/v2` fixtures for SOL and at least one SPL input into each destination asset.

## Findings and evidence

### 1. Canonical identities and asset support

1. **Relay’s Solana chain ID is its own numeric identifier, `792703809`.** Relay explains that non-EVM chains use custom IDs and its Solana guide says: “Chain ID assigned to access Solana for Relay’s tools.” Solana source quote fields are `originChainId: 792703809`, a case-sensitive base58 `user`, and a case-sensitive token mint in `originCurrency`. [Solana Support](https://docs.relay.link/references/api/api_guides/solana) · [Quickstart](https://docs.relay.link/references/api/quickstart)

2. **Native SOL uses the system-program sentinel, not wrapped SOL.** Relay’s exact table is: SOL `11111111111111111111111111111111` (9 decimals), USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (6), wSOL `So11111111111111111111111111111111111111112` (9), and USDT `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` (6). Native SOL and wSOL must not be conflated. [Solana Support](https://docs.relay.link/references/api/api_guides/solana)

3. **SPL support is broad but liquidity-dependent.** The official passage is: “We support all tokens tradeable on Jupiter” and “Relay supports **any** Solana token available on Jupiter.” This verifies that the API is not restricted to SOL/USDC, but it does not promise that every mint has a viable route at every amount. [Solana Support](https://docs.relay.link/references/api/api_guides/solana)

4. **The target destination assets are distinct currency addresses.** In particular Polygon’s requested asset is USDC.e (`0x2791…4174`), not native Polygon USDC (`0x3c499…3359`). Relay’s live `GET /chains` metadata lists both separately and gives USDC.e `id: "usdc.e"`, 6 decimals, and `supportsBridging: true`. [Live Chains API](https://api.relay.link/chains) · [Supported Tokens & Routes](https://docs.relay.link/references/api/api_resources/supported-routes)

5. **Linea mUSD is the same deterministic mUSD address shown by MetaMask, with chain context supplying identity.** MetaMask publishes `0xacA92E438df0B2401fF60dA7E4337B687a2435DA` and says mUSD operates on Ethereum, Linea, and Monad. Relay’s current route table lists “Linea, ETH, USDC, mUSD” as solver currencies. [MetaMask mUSD](https://metamask.io/price/metamask-usd) · [Relay Supported Tokens & Routes](https://docs.relay.link/references/api/api_resources/supported-routes)

6. **Accounts are VM-native strings, not one shared account identifier.** For Solana origin/EVM destination, `user` is the base58 Solana signer/depositor and `recipient` is the EVM destination account. `refundTo` should be the origin-chain Solana account. Relay warns: “Solana wallet addresses are case sensitive.” This means the local `Hex` typing for both fields is incompatible. [Solana Support](https://docs.relay.link/references/api/api_guides/solana) · [Get Quote v2](https://docs.relay.link/references/api/get-quote-v2)

### 2. Quote/route contract

**Authoritative endpoint:** `POST https://api.relay.link/quote/v2`. The older `POST /quote` is explicitly deprecated: “Use /quote/v2 instead.” [API overview](https://docs.relay.link/references/api/overview) · [Get Quote v2](https://docs.relay.link/references/api/get-quote-v2)

Minimum request for the requested flow:

```json
{
  "user": "<case-sensitive Solana base58 wallet>",
  "recipient": "<destination EVM 0x account>",
  "originChainId": 792703809,
  "originCurrency": "<SOL sentinel or SPL mint>",
  "destinationChainId": 42161,
  "destinationCurrency": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  "amount": "<integer base units>",
  "tradeType": "EXACT_INPUT",
  "refundTo": "<case-sensitive Solana base58 wallet>"
}
```

For the other targets, substitute `(137, 0x2791…4174)` or `(59144, 0xacA9…35DA)`. `amount` is a base-unit integer string. Required fields in OpenAPI are `user`, both chain IDs, both currencies, `amount`, and `tradeType`; `recipient` technically defaults to `user`, but that default is invalid as an account-model assumption across SVM→EVM and must be supplied explicitly. [Get Quote v2 OpenAPI](https://docs.relay.link/references/api/get-quote-v2.md)

Important optional request controls:

- `slippageTolerance`: integer string `0`–`10000` bps; when absent Relay “automatically calculate[s]” it to reduce front-running.
- `ttl`: seconds from quote generation; after that window an unfilled request is refunded rather than filled.
- `depositFeePayer`: Solana fee/rent payer, which “must have enough for fees and rent.”
- `includedOriginSwapSources`, `maxRouteLength`, and `useSharedAccounts`: relevant to Solana routing/transaction size.
- `includeComputeUnitLimit`: asks Relay to include a compute-unit-limit instruction.
- `appFees`, `subsidizeFees`, and `sponsoredFeeComponents` (`execution`, `swap`, `relay`, `app`, `rent`). Rent is not sponsored by default.
- `indicativeQuote`: explicitly inexecutable; never pass an indicative quote to signing.

The response includes:

- top-level `requestId` and the same identifier on each step;
- ordered `steps[]`, normally a Solana-origin `deposit` transaction step (and route-dependent additional steps), each with `items[]` and `status`;
- `item.check.endpoint`, normally `/intents/status/v3?requestId=…`;
- fee and sponsorship information;
- `details.currencyIn`, `details.currencyOut.amount`, `details.currencyOut.minimumAmount`, impacts/slippage, rate, and `timeEstimate`;
- route metadata and, when opted in, protocol data.

The OpenAPI deliberately types `step.items[].data` as unstructured/unknown. Consumers must therefore validate the actual SVM data shape rather than casting it to the EVM example. [Get Quote v2](https://docs.relay.link/references/api/get-quote-v2.md)

### 3. Solana transaction payload: instructions, not a quote-time serialized transaction

**Verified from Relay’s official SVM adapter:** the Solana step payload consumed by RelayKit is structurally:

```ts
{
  chainId: 792703809,
  instructions: Array<{
    programId: string,
    keys: Array<{
      pubkey: string,
      isSigner: boolean,
      isWritable: boolean
    }>,
    data: string // hex bytes; adapter uses Buffer.from(data, 'hex')
  }>,
  addressLookupTableAddresses?: string[]
}
```

RelayKit maps each object to a `TransactionInstruction`, resolves lookup tables, obtains a **fresh latest blockhash**, builds a `TransactionMessage` using `depositFeePayer ?? walletAddress`, calls `compileToV0Message`, creates `new VersionedTransaction(messageV0)`, and passes that unsigned transaction to the wallet’s `signAndSendTransaction` callback. [Official SVM adapter source](https://github.com/relayprotocol/relay-kit/blob/main/packages/relay-svm-wallet-adapter/src/adapter.ts)

Consequences:

- Relay’s current official client path does **not** deserialize a base64 transaction returned by `/quote/v2`; it reconstructs a v0 transaction from instruction material.
- The recent blockhash is not frozen at quote time. Ordinary Solana blockhash expiry therefore applies between construction/signing/broadcast, not between quote retrieval and construction.
- A MetaMask Snap interface that expects a base64 serialized transaction can still be used, but MetaMask must first reproduce the adapter’s compilation rules and serialize the resulting unsigned `VersionedTransaction`. That transformation is a MetaMask responsibility and needs its own validation/decision ticket.
- The official adapter validates that the returned broadcast signature is non-empty base58.
- Relay’s public OpenAPI does not formally schema this SVM payload. This is a provider-contract risk: current source code is stronger evidence than the generated OpenAPI, but not a declared stable API schema.

**Size contract:** Solana’s raw wire limit is 1232 bytes. As of Relay’s 2026-08-13 behavior change, `/quote`, `/quote/v2`, and `/price` reject oversized same- and cross-chain Solana-origin transactions at quote time with HTTP 400:

```json
{
  "message": "Generated Solana transaction is 1416 bytes, 184 over Solana's 1232 byte limit, so it cannot be signed or broadcast.",
  "errorCode": "SOLANA_TX_TOO_LARGE"
}
```

A successful quote is guaranteed to fit **as returned**, but Relay expressly warns that wallets adding compute-budget instructions (about 60 bytes) must remeasure and omit additions if they no longer fit. `maxRouteLength` 4, then 3, and a single `includedOriginSwapSources` value such as `jupiter` are documented mitigations. [Solana Support](https://docs.relay.link/references/api/api_guides/solana#transaction-size-optimization) · [Relay changelog, 2026-08-13](https://docs.relay.link/changelog#2026-08-13)

### 4. Who signs and submits

**Verified ordinary flow:** MetaMask/wallet signs **and broadcasts** the Solana source transaction. Relay’s adapter description says it “handles transaction signing and broadcasting,” and the adapted wallet requires `signAndSendTransaction(...)`. Relay then indexes the deposit; its solver submits the destination EVM fill. [Adapters](https://docs.relay.link/references/relay-kit/sdk/adapters) · [SVM adapter source](https://github.com/relayprotocol/relay-kit/blob/main/packages/relay-svm-wallet-adapter/src/adapter.ts)

**`POST /execute` is not this flow.** Relay describes `/execute` as “Execute Gasless Txs”; its request is `executionKind: "rawCalls"` with EVM-shaped `to`, hex `data`, `value`, and optional EIP-7702 authorization. Nothing in its contract accepts a Solana v0 transaction or Solana signature. [Execute](https://docs.relay.link/references/api/execute)

After broadcast, RelayKit makes a best-effort, non-awaited notification:

```json
POST /transactions/index
{
  "chainId": "792703809",
  "txHash": "<base58 Solana signature>"
}
```

The OpenAPI also permits optional `requestId`; RelayKit’s current implementation does not send it. The SDK logs notification failure and continues, implying chain indexing can still discover the deposit. For deterministic correlation MetaMask should ask Relay whether it should include `requestId`. [Transactions Index](https://docs.relay.link/references/api/transactions-index) · [RelayKit transaction helper](https://github.com/relayprotocol/relay-kit/blob/main/packages/sdk/src/utils/transaction.ts)

### 5. Correlation, expiry, status, and polling

1. **Primary correlation key:** Relay’s quote `requestId`. It appears at top level, on steps, in the on-chain deposit instruction data (inference from the purpose/step contract), and in the check URL. Relay calls it “A unique id representing the execution in the Relay system.” [Get Status](https://docs.relay.link/references/api/get-intents-status-v3.md)

2. **Hash correlation:** `GET /intents/status/v3` returns `inTxHashes[]` (origin/source transactions) and `txHashes[]` (destination/outgoing fills), along with origin/destination chain IDs and `quoteCreatedAt`. Detailed authenticated reconciliation is available from `GET /requests/v3?id=<requestId>` or by targeted deposit/fill hash filters. `/requests/v3` requires `x-api-key`. [Get Status](https://docs.relay.link/references/api/get-intents-status-v3.md) · [Get Requests](https://docs.relay.link/references/api/get-requests.md)

3. **One Relay intent-status poll covers both legs.** Status progression is `waiting` (await deposit confirmation) → `depositing` (origin confirmed via `/execute`, pending fill; wording is gasless-specific) → `pending` (deposit confirmed, destination submission pending) → `submitted` (destination submitted) → `success`. `delayed` may mean still processing. Terminal outcomes are `success`, `failure`, and `refund`. The current status OpenAPI omits `delayed` from its enum despite the narrative table including it—consumers should tolerate it. [Get Status](https://docs.relay.link/references/api/get-intents-status-v3.md)

4. **Source confirmation still belongs in the wallet layer.** RelayKit races wallet/RPC confirmation against intent polling. The SVM adapter uses `connection.confirmTransaction(...)`; the unified Relay status supplies business/bridge completion. MetaMask should preserve both: the Snap submission result/base58 signature for source UI and Relay `requestId` for cross-chain completion.

5. **Quote expiry is only partially documented.** `ttl` is explicit but its default is not published in the cited schema. `quoteCreatedAt` is observable, and expiry/failure values include `TTL_EXPIRED`, `ORDER_EXPIRED`, `PROTOCOL_DEADLINE_EXPIRED`, and `DEPOSIT_CONFIRMATION_TIMEOUT`. There is no separately documented `expiresAt` on the standard quote response. Do not invent a client timeout; ask Relay for the production default and any route-specific deadline.

6. **Polling guidance:** follow the returned `check.endpoint`; stop on `success`, `failure`, or `refund`. Relay recommends wider intervals, exponential backoff on 429, and webhooks/websockets instead of aggressive polling. RelayKit defaults to 5 seconds and roughly 2.5 minutes of attempts, but that is an SDK policy—not an API guarantee. [Step Execution](https://docs.relay.link/references/api/api_core_concepts/step-execution) · [Rate-limit handling](https://docs.relay.link/references/api/api_core_concepts/handling-rate-limits) · [RelayKit transaction helper](https://github.com/relayprotocol/relay-kit/blob/main/packages/sdk/src/utils/transaction.ts)

### 6. Fees, minimum output, slippage, and refunds

- Relay now identifies four fee classes: execution, swap, Relay/platform, and optional app fee. Execution contains a $0.02 flat fee and destination fill gas; regular wallet-submitted origin gas is paid directly by the user and is not part of that execution fee. Solana rent can be separately sponsored only when selected.
- Standard published Relay fees are 0.01% for stablecoin swaps and 0.06% for “Major swaps” (SOL ↔ a major stablecoin), subject to route campaigns. DEX fees, price impact, and solver rebalancing sit in swap impact.
- The old quote `fees` object is deprecated and incomplete. New UI should use `details.expandedPriceImpact` at quote time and `data.fees.{quoted,actual}` from `/requests/v3` for reconciliation.
- Enforce/display `details.currencyOut.minimumAmount`, not only quoted `amount`. Relay says it regenerates at execution and refunds if regenerated minimum output falls below the quoted minimum.
- Refund documentation says refunds go to origin-chain `refundTo` and: “If `refundTo` is not set, automatic refund is disabled.” This is stricter than the quote field’s older description that suggests recipient/user fallback. For Solana source, always supply a validated Solana `refundTo` and obtain provider confirmation.
- Refunds deduct refund gas, may return the post-origin-swap solver currency rather than the original token, and may be impossible below the chain’s transfer/gas threshold.

[Fee Structure](https://docs.relay.link/references/api/api_core_concepts/fees) · [Refunds](https://docs.relay.link/references/api/api_core_concepts/refunds) · [Get Quote v2](https://docs.relay.link/references/api/get-quote-v2.md)

### 7. Retry, idempotency, and failure modes

**Verified retryable quote failures:** `PRICE_FETCH_FAILED`, `REQUEST_TIMED_OUT`, `RPC_HTTP_ERROR`, and `SERVICE_UNAVAILABLE`; retry with exponential backoff. `429` also calls for exponential backoff. Relay recommends debouncing/collapsing identical in-flight quote requests. [Handling Quote Errors](https://docs.relay.link/references/api/api_core_concepts/handling-errors) · [Rate-limit handling](https://docs.relay.link/references/api/api_core_concepts/handling-rate-limits)

**Not verified:** Relay documents no idempotency key/header for `/quote/v2`, `/transactions/index`, or wallet submission. A quote generates a `requestId`; repeating a quote should be assumed to create a new intent unless Relay confirms otherwise. Never automatically sign/broadcast a second deposit after an ambiguous wallet/RPC result: query the signature and Relay request first. Relay explicitly lists `DOUBLE_SPEND` and duplicate request-ID deposits as failure/refund causes.

**Quote-time errors that must be modeled:** `AMOUNT_TOO_LOW`, disabled/unsupported chain/currency/route, insufficient funds/liquidity, invalid SVM/EVM address, invalid slippage, no swap/internal route, high impact, destination simulation failure, sanctions/compliance, and `SOLANA_TX_TOO_LARGE`. The complete current list is in Relay’s official error guide. [Handling Quote Errors](https://docs.relay.link/references/api/api_core_concepts/handling-errors)

**Post-deposit failures relevant to this flow:**

- deposit/expiry: `ORIGIN_CURRENCY_MISMATCH`, `DEPOSITED_AMOUNT_TOO_LOW_TO_FILL`, `TTL_EXPIRED`, `DEPOSIT_CONFIRMATION_TIMEOUT`, `DEPOSIT_REORGED`, `BLOCKED_WALLET`;
- capacity: `SOLVER_CAPACITY_EXCEEDED`, `SOLVER_BALANCE_TOO_LOW`, `INSUFFICIENT_FUNDS_FOR_RENT`, `SPONSOR_BALANCE_TOO_LOW`;
- Solana/Jupiter/size: `JUPITER_INVALID_TOKEN_ACCOUNT`, `NEW_CALLDATA_INCLUDES_HIGHER_RENT_FEE`, `TRANSACTION_TOO_LARGE`;
- execution: slippage, insufficient pool liquidity, too little received, generate/reverse-swap failure, destination transfer rejection/revert;
- broadcast: `TRANSACTION_SUBMISSION_FAILED` (no hash) and `TRANSACTION_NOT_INCLUDED` (hash exists but retry/gas-bump window elapsed; it may later confirm).

Refund-leg failures include too little to refund, negative amount after fees, output currency unavailable on origin, VASP/manual review, and `MANUAL_REFUND_REQUIRED`. [Handling Execution Errors](https://docs.relay.link/references/api/api_core_concepts/execution-errors) · [Get Status](https://docs.relay.link/references/api/get-intents-status-v3.md)

## Comparison with local MetaMask code

### `core/packages/transaction-pay-controller/src/strategy/relay/relay-api.ts` and `types.ts`

| Local behavior/type | Relay Solana contract | Finding |
|---|---|---|
| Quote URL defaults to `/quote` | `/quote` is deprecated; `/quote/v2` is current | **High:** feature flag/default must migrate before relying on the current contract. |
| `user`, `recipient`, `refundTo`, currencies are `Hex` | Solana user/refund and SPL/native identifiers are case-sensitive base58 strings | **Blocker:** existing request type cannot represent a Solana-source quote safely. |
| Response `RelayTransactionStep.data` is EVM `{to,data,from,maxFeePerGas,…}` | SVM step is instruction array + lookup-table addresses, compiled to a fresh v0 transaction | **Blocker:** parsing/submission requires an SVM discriminated union and runtime validation. |
| `submitRelayExecute` calls EVM `POST /execute` | ordinary Solana flow is wallet sign+broadcast + optional `/transactions/index` | **Blocker:** do not route Solana through `RelayExecuteRequest`. |
| `fetchRelayQuote` mutates response to attach request | SDK types also attach request client-side | Compatible as local metadata, but it is not provider response evidence. |
| `getRelayStatus` uses `/intents/status/v3` | Correct endpoint and request-ID correlation | Directionally compatible. |
| Status union contains `refunded` | current v3 docs use `refund`, not `refunded`; docs also narrate `delayed` but OpenAPI omits it | **Medium:** tolerate provider evolution but distinguish canonical/current values. |
| Status response omits `details`, `quoteCreatedAt`, `failReason`, `refundFailReason` | current response exposes all four | **High:** omission prevents actionable failures and expiry diagnostics. |
| Quote model relies on deprecated `fees` subset | Relay says not to rely on it for new integrations | **High:** model expanded impact/current fee reconciliation. |
| Error parser reads only `message`/`error` | Relay’s stable classifier is `errorCode` plus optional `errorData` | **High:** preserve structured code/data for retry and UX policy. |

Source paths reviewed:

- `/Users/pedrofigueiredo/repositories/metamask/core/packages/transaction-pay-controller/src/strategy/relay/relay-api.ts`
- `/Users/pedrofigueiredo/repositories/metamask/core/packages/transaction-pay-controller/src/strategy/relay/types.ts`
- `/Users/pedrofigueiredo/repositories/metamask/core/packages/transaction-pay-controller/src/strategy/relay/constants.ts`

### `packages/bridge-status-controller/src/strategy/non-evm-strategy.ts` pattern

The existing bridge-status path is a much closer execution model:

1. `handleNonEvmTx` passes a base64 trade payload to the account’s Snap with `ClientRequest:signAndSendTransaction`.
2. The Snap signs and broadcasts and returns a signature/transaction ID.
3. The code records `tradeMeta.id/hash`, adds bridge history, and starts provider/business-status polling.

That separation—**wallet/Snap owns source signing+broadcast; provider request ID owns cross-chain completion**—matches Relay. Reuse the architecture, not the existing Relay EVM API types. The missing integration seam is that Relay supplies instruction objects, while `getClientRequest` currently extracts a ready base64 trade string. A later design must decide where to compile instructions, resolve lookup tables, inject fee payer/latest blockhash, enforce 1232 bytes, and serialize to the Snap contract.

Additional reviewed source:

- `/Users/pedrofigueiredo/repositories/metamask/research-relay-solana-mm-pay/packages/bridge-status-controller/src/strategy/non-evm-strategy.ts`
- `/Users/pedrofigueiredo/repositories/metamask/research-relay-solana-mm-pay/packages/bridge-status-controller/src/utils/snaps.ts`

## Implications for later decision tickets

1. **Quote/API modeling decision:** choose `/quote/v2`; introduce VM-aware account/currency strings and a discriminated SVM step schema. Do not weaken EVM `Hex` types globally.
2. **Transaction construction/ownership decision:** explicitly choose a trusted layer (controller vs Solana Snap) to transform Relay instructions into a v0 transaction. Prefer the layer that already owns RPC/LUT access and can use a fresh blockhash immediately before signing.
3. **Snap contract decision:** decide whether the Snap accepts Relay instruction material or remains base64-only. If base64-only, specify exact serialization/version, payer, LUT failure policy, compute-budget policy, and size recheck.
4. **Submission decision:** MetaMask signs/broadcasts; call `/transactions/index` after obtaining a signature, then preserve both `requestId` and source signature. Decide whether `requestId` is included in notification after Relay confirms.
5. **Status/history decision:** model source transaction confirmation separately from Relay intent progression; store `requestId`, source signature, destination hashes, `quoteCreatedAt`, `failReason`, and `refundFailReason`. The bridge-status history/start-polling pattern is the recommended precedent.
6. **Retry/idempotency decision:** only retry classified transient quote/status/index calls. Never rebroadcast after an ambiguous result without signature/RPC/request reconciliation.
7. **Fees/slippage UX decision:** display minimum received and the full expanded impact; separately disclose user-paid SOL network fee/rent. Do not treat deprecated `fees.relayer` as total cost.
8. **Route/catalog decision:** cache `/chains` for discovery, but require a fresh executable quote for availability. Distinguish Polygon USDC.e from native USDC by address and ID.
9. **Refund decision:** always provide and persist an origin Solana `refundTo`; design for refunds in a solver currency and below-minimum no-refund outcomes.
10. **Fixture/contract-test decision:** obtain provider-approved sanitized `/quote/v2` fixtures for SOL and SPL origins, including LUT and no-LUT cases, for each destination; add schema drift tests around SVM `data` because OpenAPI leaves it untyped.

The Jira UI was not accessible without an authenticated browser, so later ticket IDs/names beyond the supplied CONF-1883/Wayfinder title could not be enumerated. The implications above are named by decision domain and should be mapped to the child tickets in Jira.

## Unresolved provider questions

These are release gates, ordered by severity:

1. **Blocker — SVM response schema stability:** Will Relay publish and version the exact `/quote/v2` Solana `items[].data` JSON schema (`instructions`, key fields, hex encoding, LUT addresses, and any other fields)? Is the SDK adapter source contractually authoritative?
2. **Blocker — live route attestation:** Provide successful sanitized production quotes for native SOL and at least one SPL input to Arbitrum USDC, Polygon USDC.e, and Linea mUSD, including supported min/max amounts and any route restrictions. Metadata support alone does not prove current liquidity.
3. **High — TTL/default expiry:** What is the default `ttl` when omitted, does it vary by route, and is there a response deadline field consumers can rely on? How does it interact with order/protocol deadlines and quote regeneration?
4. **High — refund semantics:** Is automatic refund truly disabled without `refundTo` for normal instruction-based Solana deposits, despite the older quote description’s recipient/user fallback? What Solana currency is returned for SOL/SPL origin-swap failures?
5. **High — submission notification:** Should clients include `requestId` in `/transactions/index`? Is the endpoint idempotent by `(chainId, txHash)`, and what retry semantics/status codes apply?
6. **High — ambiguous broadcast:** What exact recovery procedure does Relay recommend when the wallet times out after signing but before returning the signature? Can request ID locate an observed source deposit before a hash is known?
7. **High — compute budget and priority fees:** Does the returned instruction list include all required compute-budget/priority-fee instructions? Should MetaMask ever prepend them, and who bears failure if doing so crosses 1232 bytes?
8. **Medium — lookup tables:** RelayKit silently skips unresolved LUTs while claiming the transaction remains valid without them. Is that safe for all generated quotes, or should MetaMask fail closed/requote because omitting LUT compression can exceed the wire limit?
9. **Medium — status enum:** Is `delayed` guaranteed from `/intents/status/v3` although missing from its current OpenAPI enum? Can `fallback` or `refunded` still appear for legacy/current flows?
10. **Medium — polling SLA:** Expected Solana confirmation/index/fill times, recommended polling interval/timeout, finality commitment, and support escalation threshold for each target route.
11. **Medium — sponsorship:** Is source SOL fee/rent sponsorship available for MetaMask Pay’s Solana flow, and if so does it require `depositFeePayer`, a specific API key configuration, or a different flow?
12. **Medium — exact-output behavior:** Is `EXACT_OUTPUT` supported for ordinary Solana instruction deposits to these destinations, and what surplus/refund semantics apply? Initial implementation should use `EXACT_INPUT` until confirmed.

## Confidence

| Area | Confidence | Reason |
|---|---|---|
| Chain IDs and token addresses | High | Official Relay guide/live metadata and official MetaMask mUSD source agree. |
| Quote v2 request and generic response | High | Current official OpenAPI. |
| Solana instruction/build/sign/broadcast behavior | High | Direct official adapter implementation and SDK execution source. |
| Status and documented failures | High | Current v3 OpenAPI, error guides, and 2026 changelog. |
| Availability of each exact route at a specific amount | Medium-low | Current metadata advertises chains/assets and generic Solana/Jupiter support, but no live authenticated POST quote was captured. Availability is dynamic. |
| TTL/default expiry and idempotency | Low | Parameters/failure modes exist, but defaults and retry guarantees are not documented. |
| Long-term stability of SVM step payload | Medium-low | Primary-source implementation exists; public OpenAPI leaves `data` untyped. |

## Review findings

- **blocker:** `core/packages/transaction-pay-controller/src/strategy/relay/types.ts` — `Hex` account/currency types and EVM-only step data cannot represent a Solana-source quote.
- **blocker:** `core/packages/transaction-pay-controller/src/strategy/relay/relay-api.ts` — `submitRelayExecute` is an EVM gasless raw-call flow and must not submit Solana quote steps.
- **high:** `core/packages/transaction-pay-controller/src/strategy/relay/constants.ts` — default quote endpoint is deprecated `/quote`, while current provider contract is `/quote/v2`.
- **high:** `core/packages/transaction-pay-controller/src/strategy/relay/types.ts` — status model drops current diagnostic fields (`quoteCreatedAt`, `failReason`, `refundFailReason`, `details`).
- **high:** `core/packages/transaction-pay-controller/src/strategy/relay/relay-api.ts` — non-OK handling discards Relay `errorCode`/`errorData`, preventing reliable retry and user-error classification.
- **medium:** `packages/bridge-status-controller/src/utils/snaps.ts` — Snap expects a ready serialized/base64 transaction, whereas Relay supplies instruction material; compilation ownership is unresolved.
- **positive:** `packages/bridge-status-controller/src/strategy/non-evm-strategy.ts` — its sign/broadcast → persist source hash → start provider-status polling lifecycle is the correct architectural precedent.

## Sources

### Kept

- [Relay Solana Support](https://docs.relay.link/references/api/api_guides/solana) — canonical IDs, tokens, account rules, native/SPL support, transaction-size contract.
- [Relay Get Quote v2/OpenAPI](https://docs.relay.link/references/api/get-quote-v2.md) — authoritative request and generic response contract.
- [Relay Get Status v3/OpenAPI](https://docs.relay.link/references/api/get-intents-status-v3.md) — statuses, hashes, timestamps, and failure fields.
- [Relay step execution](https://docs.relay.link/references/api/api_core_concepts/step-execution) — wallet execution and check polling contract.
- [Relay official SVM adapter](https://github.com/relayprotocol/relay-kit/blob/main/packages/relay-svm-wallet-adapter/src/adapter.ts) — exact current instruction compilation, blockhash, signing, and confirmation behavior.
- [RelayKit transaction helper](https://github.com/relayprotocol/relay-kit/blob/main/packages/sdk/src/utils/transaction.ts) — notification, polling, correlation, and SDK timeout policy.
- [Relay Transactions Index](https://docs.relay.link/references/api/transactions-index) — post-broadcast notification shape.
- [Relay Handling Quote Errors](https://docs.relay.link/references/api/api_core_concepts/handling-errors) — retryable and validation errors.
- [Relay Handling Execution Errors](https://docs.relay.link/references/api/api_core_concepts/execution-errors) — fill/refund failure semantics.
- [Relay Fee Structure](https://docs.relay.link/references/api/api_core_concepts/fees) and [Refunds](https://docs.relay.link/references/api/api_core_concepts/refunds) — economic and failure outcomes.
- [Relay live Chains API](https://api.relay.link/chains) and [Supported Routes](https://docs.relay.link/references/api/api_resources/supported-routes) — dynamic chain/currency support.
- [Relay changelog](https://docs.relay.link/changelog) — changes through 2026-08-20, notably Solana size gating and v3 failure fields.
- [MetaMask mUSD](https://metamask.io/price/metamask-usd) — first-party mUSD address/network confirmation.

### Dropped

- SEO “best Solana API” articles — secondary, unrelated to Relay’s contract.
- Relay issue #927 alone — useful history for transaction-size failures but superseded by official 2026 documentation/changelog.
- Third-party bridge and explorer pages — unnecessary where first-party Relay/MetaMask evidence exists.
- Jira page content — authentication/JavaScript prevented retrieval; only the user-supplied ticket title and map were used.

## Gaps / residual risks

- No production `/quote/v2` POST fixtures were captured because this research environment did not expose a safe authenticated POST client/account and no transaction should be initiated for desk research.
- Route support can change after this document; the live quote remains authoritative.
- SVM `items[].data` is untyped in Relay OpenAPI, so provider schema drift remains a blocker until fixtures or a published schema are contract-tested.
- Quote default TTL, API idempotency, refund fallback, and ambiguous-broadcast recovery remain undocumented.
- The evidence is current through Relay changelog entries dated 2026-08-20. Recheck the changelog and live metadata immediately before implementation or release.
