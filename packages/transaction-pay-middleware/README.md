# `@metamask/transaction-pay-middleware`

Implements the `wallet_pay` JSON-RPC method, which lets dapps request MetaMask Pay transactions.

## Installation

`yarn add @metamask/transaction-pay-middleware`

or

`npm install @metamask/transaction-pay-middleware`

## JSON-RPC Methods

### wallet_pay

Asks the user to confirm a MetaMask Pay transaction of the given type, and resolves once the transfer completes.

**Parameters:**

- `type` (string): The transaction type. Supported: `perpsDeposit`, `perpsWithdraw`.
- `from` (string): The account to use. Must be connected to the requesting site.
- `amount` (string, optional): The amount to prefill, as a decimal string with up to 6 decimals (for example `"10"` or `"12.5"`).

Unknown fields are rejected.

**Returns:**

- `transactionHash` (string, optional): The hash to monitor. Omitted when the transfer completes without one.

**Example:**

```json
{
  "method": "wallet_pay",
  "params": [
    {
      "type": "perpsDeposit",
      "from": "0x1234567890123456789012345678901234567890",
      "amount": "10"
    }
  ]
}
```

**Errors:**

| Code     | When                                                                                    |
| -------- | --------------------------------------------------------------------------------------- |
| `-32602` | The params are invalid. The message names each failing field.                           |
| `-32601` | The type is unknown, or not enabled for the requesting site.                            |
| `4100`   | `from` is not connected to the site.                                                    |
| `-32004` | The user is not eligible for perps in their region (`data.reason: "perpsNotEligible"`). |
| `4001`   | The user rejected the request.                                                          |

## Usage

`walletPay` is a JSON-RPC method handler. The client supplies a hook for the requesting site's connected accounts, and a messenger for the controllers it uses:

```ts
import { walletPay } from '@metamask/transaction-pay-middleware';

const middleware = createScaffoldMiddleware({
  wallet_pay: createAsyncMiddleware(async (req, res) => {
    await walletPay(
      req,
      res,
      {
        getPermittedAccountsForOrigin: async () =>
          getPermittedAccounts(req.origin),
      },
      transactionPayMiddlewareMessenger,
    );
  }),
});
```

The messenger must allow:

- `RemoteFeatureFlagController:getState`: `wallet_pay` is enabled per site and per type by the `confirmations_pay_rpc` flag, and `perpsWithdraw` also requires the in-wallet withdraw flag, `confirmations_pay_post_quote`.
- `TransactionController:addTransaction` and `NetworkController:findNetworkClientIdByChainId`: the transaction is added for the requesting site. Its chain must already be configured; the dapp is expected to add it first.
- `PerpsController:getState` and `PerpsController:refreshEligibility`: perps types check the user's eligibility.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
