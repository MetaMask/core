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

This can be selected by the user via the transaction confirmation in the client, or automatically selected based on the highest balance and chain.

## Pay Strategies

The mechanism by which the tokens are provided on the target chain is abstracted into a `PayStrategy`.

Each `PayStrategy` dictates how the `quotes` are retrieved, which detail the associated fees and strategy specific data, and how those quotes are actioned or "submitted".

`TransactionPayController` provides an ordered strategy list via internal `getStrategies` callback configuration.
The quote flow iterates strategies in order, applies `supports(...)` compatibility checks when present, and falls back to the next compatible strategy if quote retrieval fails or returns no quotes.

### Bridge

The `BridgeStrategy` bridges tokens from the payment our source token to the target chain.

Quotes are retrieved from the MetaMask Bridge API via the `BridgeController`, then submitted using the `BridgeStatusController`.

The `BridgeStatusController` generates suitable transactions via the `TransactionController` that target the MetaMask Bridge contract which in turn communicates with a specific Bridge provider according to the quote.

### Relay

The `RelayStrategy` also requires a payment or source token.

Quotes are retrieved from the [Relay API](https://docs.relay.link/what-is-relay), then submitted via a transaction directly to the `TransactionController`.

The resulting transaction deposits the necessary funds (on the source network), then a Relayer on the target chain immediately transfers the necessary funds and optionally executes any requested call data.

Relay deprecates `/quote`, but the existing EVM integration remains on that endpoint to avoid changing its established contract in this work. Solana uses `/quote/v2`, the supported endpoint exercised by the verified integration fixtures. Relay's current public OpenAPI documents the generic quote request, including destination `txs`, but does not fully document the observed Solana instruction and lookup-table response. Core therefore structurally validates that integration-specific response before passing it to client-owned preparation.

A Solana source broadcasts exactly once: Core persists `attempting` on the target transaction before crossing the Snap callback, and the publish hook returns `externallyHandled`. TransactionController suppresses EVM RPC fallback and EVM receipt polling for the hashless EVM parent. Status-only Pay reconciliation owns later source, Relay, and parent lifecycle transitions and never calls `signAndSendTransaction`.

A non-atomic Money Account route may perform one sponsored destination follow-up after Relay success. That destination action has its own durable checkpoint and is not a source retry or source resubmission.

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

Chain-agnostic source account and asset metadata is stored only on the persisted target transaction in `metamaskPay.source`. The CAIP-10 account and CAIP-19 asset identify their source chain without placing non-EVM identifiers in legacy EVM-only fields.

Once an executable Solana quote exists, the same target transaction becomes the single durable owner of `metamaskPay.solanaExecution`. This phase-aware checkpoint contains the immutable wallet account ID and source amount, derived source chain, Relay correlation, optional source signature, observation states, and any Money Account follow-up. `TransactionPayController.state` remains entirely transient and contains no duplicate execution record.
