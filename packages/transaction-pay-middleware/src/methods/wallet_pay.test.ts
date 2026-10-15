/* eslint-disable @typescript-eslint/naming-convention */
import { errorCodes } from '@metamask/rpc-errors';
import { TransactionType } from '@metamask/transaction-controller';
import type { Hex, Json, PendingJsonRpcResponse } from '@metamask/utils';

import { createMessenger } from '../tests/messenger-mock.js';
import type { MessengerMocks } from '../tests/messenger-mock.js';
import type { WalletPayHooks, WalletPayJsonRpcRequest } from '../types.js';
import { walletPay } from './wallet_pay.js';

const ORIGIN = 'https://perps-terminal.metamask.com';
const FROM = '0x1234567890abcdef1234567890abcdef12345678' as Hex;
const CHECKSUM_FROM = '0x1234567890AbcdEF1234567890aBcdef12345678' as Hex;
const OTHER = '0x0000000000000000000000000000000000000001';
const HASH = '0xhash';

const ALLOW_BOTH_FLAGS: Record<string, Json> = {
  confirmations_pay_rpc: {
    allowedTypes: ['perpsDeposit', 'perpsWithdraw'],
    dapps: { [ORIGIN]: { allowedTypes: ['perpsDeposit', 'perpsWithdraw'] } },
  },
  confirmations_pay_post_quote: { default: { enabled: true } },
};

/**
 * Runs `walletPay` and returns the response and mocks.
 *
 * @param options - Inputs.
 * @param options.params - The request params; `null` for none.
 * @param options.permittedAccounts - Accounts connected to the origin.
 * @param options.messengerOptions - Options for the mock messenger.
 * @returns The response, request, hooks and messenger mocks.
 */
async function run({
  params = [{ type: 'perpsDeposit', from: FROM, amount: '10' }],
  permittedAccounts = [FROM],
  messengerOptions = { remoteFeatureFlags: ALLOW_BOTH_FLAGS },
}: {
  params?: unknown;
  permittedAccounts?: string[];
  messengerOptions?: Parameters<typeof createMessenger>[0];
} = {}): Promise<{
  response: PendingJsonRpcResponse;
  request: WalletPayJsonRpcRequest;
  hooks: jest.Mocked<WalletPayHooks>;
  mocks: MessengerMocks;
}> {
  const mocks = createMessenger(messengerOptions);
  const hooks: jest.Mocked<WalletPayHooks> = {
    getPermittedAccountsForOrigin: jest.fn(async () => permittedAccounts),
  };
  const request: WalletPayJsonRpcRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'wallet_pay',
    origin: ORIGIN,
    params: (params ?? undefined) as Json[],
  };
  const response: PendingJsonRpcResponse = { jsonrpc: '2.0', id: 1 };

  await walletPay(request, response, hooks, mocks.messenger);

  return { response, request, hooks, mocks };
}

/**
 * Runs `walletPay` and returns the error it throws.
 *
 * @param options - Inputs for {@link run}.
 * @returns The thrown error.
 */
async function runError(
  options: Parameters<typeof run>[0],
): Promise<{ code?: number; message: string }> {
  return (await run(options).catch((error: unknown) => error)) as {
    code?: number;
    message: string;
  };
}

describe('walletPay', () => {
  describe('params', () => {
    it.each([
      ['missing params', null, 'Expected an array'],
      ['an empty array', [], '0'],
      [
        'more than one element',
        [
          { type: 'perpsDeposit', from: FROM },
          { type: 'perpsDeposit', from: FROM },
        ],
        '1',
      ],
      ['a missing type', [{ from: FROM }], 'type'],
      ['an empty type', [{ type: '', from: FROM }], 'type'],
      ['a missing from', [{ type: 'perpsDeposit' }], 'from'],
      ['a malformed from', [{ type: 'perpsDeposit', from: '0x123' }], 'from'],
      [
        'an unknown field',
        [{ type: 'perpsDeposit', from: FROM, token: 'USDC' }],
        'token',
      ],
      [
        'a numeric amount',
        [{ type: 'perpsDeposit', from: FROM, amount: 10 }],
        'amount',
      ],
    ])('rejects %s', async (_label, params, field) => {
      const error = await runError({ params });

      expect(error.code).toBe(errorCodes.rpc.invalidParams);
      expect(error.message).toContain(field);
    });

    it.each(['-1', '0', '0.000', '1.1234567', 'abc', '1e3', ''])(
      'rejects amount "%s"',
      async (amount) => {
        const error = await runError({
          params: [{ type: 'perpsDeposit', from: FROM, amount }],
        });

        expect(error.code).toBe(errorCodes.rpc.invalidParams);
      },
    );

    it.each(['10', '0.5', '12.123456'])('accepts amount %s', async (amount) => {
      const { response } = await run({
        params: [{ type: 'perpsDeposit', from: FROM, amount }],
      });

      expect(response.result).toStrictEqual({ transactionHash: HASH });
    });

    it('accepts a checksummed from address', async () => {
      const { response } = await run({
        params: [{ type: 'perpsDeposit', from: CHECKSUM_FROM }],
      });

      expect(response.result).toStrictEqual({ transactionHash: HASH });
    });

    it('validates params before reading flags', async () => {
      const mocks = createMessenger();
      const response: PendingJsonRpcResponse = { jsonrpc: '2.0', id: 1 };

      await expect(
        walletPay(
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'wallet_pay',
            origin: ORIGIN,
            params: [],
          },
          response,
          { getPermittedAccountsForOrigin: jest.fn() },
          mocks.messenger,
        ),
      ).rejects.toMatchObject({ code: errorCodes.rpc.invalidParams });
      expect(mocks.getRemoteFeatureFlagState).not.toHaveBeenCalled();
    });
  });

  describe('flag gate', () => {
    it('rejects a type the flag does not allow for the origin', async () => {
      const error = await runError({ messengerOptions: {} });

      expect(error.code).toBe(errorCodes.rpc.methodNotFound);
    });

    it('rejects an allowed type with no flow', async () => {
      const error = await runError({
        params: [{ type: 'somethingElse', from: FROM }],
        messengerOptions: {
          remoteFeatureFlags: {
            confirmations_pay_rpc: {
              allowedTypes: ['somethingElse'],
              dapps: { [ORIGIN]: { allowedTypes: ['somethingElse'] } },
            },
          },
        },
      });

      expect(error.code).toBe(errorCodes.rpc.methodNotFound);
    });

    it('does not treat inherited object keys as flows', async () => {
      const error = await runError({
        params: [{ type: 'toString', from: FROM }],
      });

      expect(error.code).toBe(errorCodes.rpc.methodNotFound);
    });

    it('rejects perpsWithdraw when the in-wallet withdraw flag is off', async () => {
      const error = await runError({
        params: [{ type: 'perpsWithdraw', from: FROM }],
        messengerOptions: {
          remoteFeatureFlags: {
            ...ALLOW_BOTH_FLAGS,
            confirmations_pay_post_quote: { default: { enabled: false } },
          },
        },
      });

      expect(error.code).toBe(errorCodes.rpc.methodNotFound);
    });

    it('rejects an unsupported type before checking the account', async () => {
      const error = await runError({
        params: [{ type: 'somethingElse', from: FROM }],
        permittedAccounts: [],
      });

      expect(error.code).toBe(errorCodes.rpc.methodNotFound);
    });
  });

  describe('account gate', () => {
    it('rejects an origin with no permitted accounts', async () => {
      const error = await runError({ permittedAccounts: [] });

      expect(error.code).toBe(errorCodes.provider.unauthorized);
    });

    it('rejects a from address that is not permitted', async () => {
      const error = await runError({ permittedAccounts: [OTHER] });

      expect(error.code).toBe(errorCodes.provider.unauthorized);
    });

    it('accepts a permitted from address with different casing', async () => {
      const { response } = await run({ permittedAccounts: [CHECKSUM_FROM] });

      expect(response.result).toStrictEqual({ transactionHash: HASH });
    });

    it('allows a perps withdraw for any permitted account', async () => {
      const { response } = await run({
        params: [{ type: 'perpsWithdraw', from: OTHER }],
        permittedAccounts: [FROM, OTHER],
      });

      expect(response.result).toStrictEqual({ transactionHash: HASH });
    });
  });

  describe('preconditions', () => {
    it('rejects when not eligible for perps', async () => {
      const error = await runError({
        messengerOptions: {
          remoteFeatureFlags: ALLOW_BOTH_FLAGS,
          eligibility: [false],
        },
      });

      expect(error.code).toBe(errorCodes.rpc.methodNotSupported);
    });
  });

  describe('transaction', () => {
    it('adds the transaction for the requesting dapp', async () => {
      const { mocks, request } = await run();

      expect(mocks.findNetworkClientIdByChainId).toHaveBeenCalledWith('0xa4b1');
      expect(mocks.addTransaction).toHaveBeenCalledTimes(1);

      const [transactionParams, options] = mocks.addTransaction.mock.calls[0];

      expect(transactionParams).toMatchObject({ from: FROM });
      expect(options).toStrictEqual({
        networkClientId: 'arbitrum-mainnet',
        origin: ORIGIN,
        requestId: String(request.id),
        method: 'wallet_pay',
        requireApproval: true,
        type: TransactionType.perpsDeposit,
        skipInitialGasEstimate: true,
      });
    });

    it('adds a perps withdraw transaction', async () => {
      const { mocks } = await run({
        params: [{ type: 'perpsWithdraw', from: FROM, amount: '5' }],
      });

      expect(mocks.addTransaction.mock.calls[0][1]).toMatchObject({
        type: TransactionType.perpsWithdraw,
        skipInitialGasEstimate: true,
      });
    });

    it('rejects when the chain is not configured', async () => {
      const mocks = createMessenger({ remoteFeatureFlags: ALLOW_BOTH_FLAGS });
      mocks.findNetworkClientIdByChainId.mockImplementation(() => {
        throw new Error('Invalid chain ID');
      });

      await expect(
        walletPay(
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'wallet_pay',
            origin: ORIGIN,
            params: [{ type: 'perpsDeposit', from: FROM }],
          },
          { jsonrpc: '2.0', id: 1 },
          { getPermittedAccountsForOrigin: async () => [FROM] },
          mocks.messenger,
        ),
      ).rejects.toMatchObject({ code: errorCodes.rpc.internal });
      expect(mocks.addTransaction).not.toHaveBeenCalled();
    });

    it('propagates a user rejection', async () => {
      const rejection = Object.assign(new Error('User rejected'), {
        code: errorCodes.provider.userRejectedRequest,
      });
      const mocks = createMessenger({ remoteFeatureFlags: ALLOW_BOTH_FLAGS });
      mocks.addTransaction.mockImplementation(async () => {
        throw rejection;
      });

      await expect(
        walletPay(
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'wallet_pay',
            origin: ORIGIN,
            params: [{ type: 'perpsDeposit', from: FROM }],
          },
          { jsonrpc: '2.0', id: 1 },
          { getPermittedAccountsForOrigin: async () => [FROM] },
          mocks.messenger,
        ),
      ).rejects.toBe(rejection);
    });
  });

  describe('result', () => {
    it('returns only the transaction hash', async () => {
      const { response } = await run();

      expect(response.result).toStrictEqual({ transactionHash: HASH });
    });

    it('omits the 0x0 placeholder hash', async () => {
      const { response } = await run({
        messengerOptions: { remoteFeatureFlags: ALLOW_BOTH_FLAGS, hash: '0x0' },
      });

      expect(response.result).toStrictEqual({});
    });

    it('omits an empty hash', async () => {
      const { response } = await run({
        messengerOptions: { remoteFeatureFlags: ALLOW_BOTH_FLAGS, hash: '' },
      });

      expect(response.result).toStrictEqual({});
    });
  });
});
