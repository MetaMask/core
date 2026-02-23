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

State is grouped according to the associated transaction ID in the `transactionData` property.

This transaction specific data includes any required tokens, selected payment token, retrieved quotes, and calculated totals.
