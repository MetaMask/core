# Architecture

The ultimate purpose of the `TransactionPayController` is to automatically provide ERC-20 or native tokens on the appropriate chains and accounts, in order to enable and simplify EVM transactions.

This functionality is referred to as `MetaMask Pay` in the MetaMask clients.

## Required Tokens

The tokens required by a transaction are automatically identified from various sources, this includes:

- ERC-20 Token Transfers
  - Identified from the call data using the `0xa9059cbb` four-byte prefix.
  - Supports EIP-7702 transactions where the token transfer is a nested call.
- Gas Fees
  - A required native token is generated from the gas limit and gas fee parameters, including estimates from the `GasFeeController`.

See [required-tokens.ts](/packages/transaction-pay-controller/src/utils/required-tokens.ts).

## Payment Token

The payment token is the source ERC-20 or native token which will provide the funds for the transaction on the target chain.

A payment token is identified by its CAIP-19 asset type, as keyed in `AssetsController` state, for both EVM tokens and non-EVM tokens such as Solana SOL or an SPL token. For EVM tokens, the Hex chain ID and token address used by the EVM strategies are derived from the asset type. `accountOverride` is the ID of an `InternalAccount`. A non-EVM token is held by the override account when it supports the asset chain, otherwise by the account in the same account group as the override account, or as the transaction account, that supports the asset chain. Non-EVM token metadata, balances, and prices are read from `AssetsController` state.

This can be selected by the user via the transaction confirmation in the client, or automatically selected based on the highest balance and chain.

## Pay Strategies

The mechanism by which the tokens are provided on the target chain is abstracted into a `PayStrategy`.

Each `PayStrategy` dictates how the `quotes` are retrieved, which detail the associated fees and strategy specific data, and how those quotes are actioned or "submitted".

`TransactionPayController` provides an ordered strategy list via internal `getStrategies` callback configuration.
The quote flow iterates strategies in order, applies `supports(...)` compatibility checks when present, and falls back to the next compatible strategy if quote retrieval fails or returns no quotes.

Every payment token produces quote requests the same way, with one `QuoteRequest` shape for every protocol. Each request identifies its source by the CAIP-19 `sourceAssetId` and the CAIP-10 `sourceAccountId` of the account holding the source token, EVM included. Shared quote code does not branch on the source protocol. Strategies opt in to a source protocol through `supports(...)`: `AcrossStrategy`, `ServerStrategy` and `FiatStrategy` only support `eip155` sources, while `RelayStrategy` supports every source. EVM code that needs a Hex chain ID or token address derives them from `sourceAssetId` with `getEvmQuoteSource`. The only functional pivot is at execution: an EVM source is submitted through the `TransactionController`, and a non-EVM source through the account Snap (`SnapController`). Post-quote flows with a non-EVM destination token produce no quote requests.

### Bridge

The `BridgeStrategy` bridges tokens from the payment our source token to the target chain.

Quotes are retrieved from the MetaMask Bridge API via the `BridgeController`, then submitted using the `BridgeStatusController`.

The `BridgeStatusController` generates suitable transactions via the `TransactionController` that target the MetaMask Bridge contract which in turn communicates with a specific Bridge provider according to the quote.

### Relay

The `RelayStrategy` also requires a payment or source token.

Quotes are retrieved from the [Relay API](https://docs.relay.link/what-is-relay), then submitted via a transaction directly to the `TransactionController`.

The resulting transaction deposits the necessary funds (on the source network), then a Relayer on the target chain immediately transfers the necessary funds and optionally executes any requested call data.

#### Non-EVM sources (Solana)

When the `sourceAssetId` of a quote request is not on an `eip155` chain, `RelayStrategy` prepares it for execution through the account Snap, modelled on the `BridgeStatusController` non-EVM submit handler. The Solana-specific quote preparation (compiling the Relay instructions, the Snap `computeFee` and the rent reserve) stays inside `RelayStrategy`. EVM sources keep using the Relay `/quote` endpoint unchanged. The Snap requests use the `InternalAccount` whose address and scopes match the CAIP-10 `sourceAccountId` of the request, so the payment token never stores the wallet account ID.

- **Quote.** New quotes are only admitted when `payStrategies.relay.solana.enabled` is `true`. Core builds the request and fetches it from the Relay quote URL (`relayQuoteUrl`, the MetaMask Relay proxy), which passes the Solana instructions and lookup tables through. If Relay rejects the transaction as `SOLANA_TX_TOO_LARGE`, Core retries once with `maxRouteLength: 4`. Relay returns instructions and address lookup tables rather than a serialized transaction, so Core compiles the unsigned v0 transaction itself:
  - the fee payer is the user;
  - the blockhash and lookup tables come from Solana JSON-RPC at the `ConfigRegistryController` RPC URL (with `{infuraProjectId}` replaced by the `infuraProjectId` constructor option), and unresolved lookup tables are skipped;
  - compilation uses `@solana/kit` sub-packages.
- **Fees and affordability.** The account Snap's `computeFee` gives the source network fee, which is converted to fiat with the SOL price. The Snap `getMinimumBalanceForRentExemption` gives the rent reserve.
  - For native SOL, the balance must cover the amount, the fee and the rent reserve. A native SOL max amount is re-quoted with the fee and rent withheld.
  - For an SPL source, the token balance must cover the amount, and native SOL must cover the fee and rent.
  - A shortfall is reported through `quoteError`, and the quote is kept.
  - The result is an ordinary `TransactionPayQuote`, so `calculateTotals` and the client rows work unchanged.
- **Submit.** The publish hook passes the quotes to `execute`, and `RelayStrategy` reacts to the protocol of their `sourceAssetId`. For a non-EVM source, Core then:
  1. recompiles the transaction with a fresh blockhash;
  2. persists the `metamaskPay.solanaExecution` `attempting` checkpoint;
  3. makes exactly one `SnapController:handleRequest` call (`onClientRequest` / `signAndSendTransaction`) to the Snap in the account metadata;
  4. persists the signature and notifies Relay (`/transactions/index`);
  5. waits for Relay completion, then reconciles the checkpoint, which runs the non-atomic second leg for Money Account flows;
  6. returns `{ externallyHandled: true, outcome }`, so `TransactionController` never publishes it through EVM RPC.
- **Recovery.** If a checkpoint exists, Core never signs again. `reconcileSolanaPay` and `recoverSolanaPayStatus` observe Relay status by request ID, where `inTxHashes` carries the source signature. Once Relay succeeded and the source is confirmed, reconcile runs the Money Account second leg once, guarded by the persisted `attempting` follow-up checkpoint; this is not a source re-sign. Core then confirms or fails the externally published target transaction. While Relay has not indexed a submitted source, Core also reads its Solana RPC status (`getSignatureStatuses`, plus `getBlockHeight` against the checkpoint `lastValidBlockHeight`) to detect a failed or expired source; the publish hook uses the same read to stop waiting for Relay. `recoverSolanaPayStatus` makes one independent observation per non-terminal checkpoint and returns; clients call it again on foreground or startup.

## Lifecycle

The high level interaction with the `TransactionPayController` is as follows:

1. Client assigns the `TransactionPayPublishHook` as a publish hook in the `TransactionController` during initialisation.
2. Controller subscribes to `TransactionController` state changes during initialisation.
3. An unapproved transaction is created in a MetaMask client, either internally or via a dApp.
4. Controller identifies any required tokens and adds them to its state.
5. If a client confirmation is using `MetaMask Pay`, the user selects a payment token (or it is done automatically) which invokes the `updatePaymentToken` action.
   - The below steps are also triggered if the transaction `data` is updated.
6. Controller resolves an ordered set of `PayStrategy` implementations using internal callback configuration.
7. Controller requests quotes from each compatible strategy in order until one returns quotes, then persists those quotes and associated totals.
8. Resulting fees and totals are presented in the client transaction confirmation.
9. If approved by the user, the target transaction is signed and published.
10. The `TransactionPayPublishHook` is invoked and submits the relevant quotes via the strategy encoded in the quote.
11. The hook waits for any transactions and quotes to complete.
12. Depending on the pay strategy and required tokens, the original target transaction is also published as the required funds are now in place on the user's account on the target chain.
13. Target transaction is finalized and any related controller state is removed.

## State

Transient state is grouped according to the associated transaction ID in the `transactionData` property. It includes required tokens, the selected payment token, retrieved quotes, and calculated totals, and is not persisted across restarts.

The legacy `metamaskPay.chainId` and `metamaskPay.tokenAddress` fields on the target transaction only describe EVM payment tokens, and are left unset when a non-EVM payment token is selected. Execution correlation and recovery checkpoints are not part of ordinary Pay selection state. Once a non-EVM execution starts, the target transaction becomes the only durable owner of `metamaskPay.solanaExecution`. This checkpoint holds the wallet account ID, source chain, source amount, Relay request ID, source signature, observation states and any Money Account follow-up, and is the only persisted source of a non-EVM execution read by lifecycle and recovery code.
