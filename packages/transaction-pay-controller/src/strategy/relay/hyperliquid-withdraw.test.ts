import { successfulFetch } from '@metamask/controller-utils';
import { SignTypedDataVersion } from '@metamask/keyring-controller';
import type { Hex } from '@metamask/utils';

import { getMessengerMock } from '../../tests/messenger-mock';
import type { TransactionPayQuote } from '../../types';
import { RELAY_AUTHORIZE_URL, HYPERLIQUID_EXCHANGE_URL } from './constants';
import { submitHyperliquidWithdraw } from './hyperliquid-withdraw';
import type { RelayQuote, RelaySignatureStep } from './types';

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  successfulFetch: jest.fn(),
}));

const FROM_MOCK = '0xabc123' as Hex;

const SIGNATURE_MOCK = `0x${'aa'.repeat(32)}${'bb'.repeat(32)}1b`;

const AUTHORIZE_STEP_MOCK: RelaySignatureStep = {
  id: 'authorize',
  kind: 'signature',
  requestId: 'req-1',
  items: [
    {
      data: {
        sign: {
          signatureKind: 'eip712',
          domain: {
            name: 'relay.link',
            version: '1',
            chainId: 42161,
          },
          types: {
            Authorize: [
              { name: 'nonce', type: 'uint256' },
              { name: 'account', type: 'address' },
            ],
          },
          value: { nonce: 123, account: FROM_MOCK },
          primaryType: 'Authorize',
        },
        post: {
          endpoint: RELAY_AUTHORIZE_URL,
          method: 'POST' as const,
          body: { requestId: 'req-1' },
        },
      },
      status: 'incomplete' as const,
    },
  ],
};

const DEPOSIT_STEP_MOCK = {
  id: 'deposit',
  kind: 'transaction',
  requestId: 'req-1',
  items: [
    {
      data: {
        action: {
          type: 'usdSend',
          parameters: {
            destination: '0xsolver',
            amount: '10000000',
            hyperliquidChain: 'Mainnet',
          },
        },
        nonce: 1234567890000,
        eip712Types: {
          'HyperliquidTransaction:UsdSend': [
            { name: 'hyperliquidChain', type: 'string' },
            { name: 'destination', type: 'string' },
            { name: 'amount', type: 'string' },
          ],
        },
        eip712PrimaryType: 'HyperliquidTransaction:UsdSend',
      },
      status: 'incomplete',
    },
  ],
};

function buildQuote(
  steps: unknown[] = [AUTHORIZE_STEP_MOCK, DEPOSIT_STEP_MOCK],
): TransactionPayQuote<RelayQuote> {
  return {
    original: { steps },
  } as TransactionPayQuote<RelayQuote>;
}

describe('submitHyperliquidWithdraw', () => {
  const successfulFetchMock = jest.mocked(successfulFetch);
  const { messenger } = getMessengerMock();

  let signTypedMessageMock: jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();

    signTypedMessageMock = jest.fn().mockResolvedValue(SIGNATURE_MOCK);

    messenger.registerActionHandler(
      'KeyringController:signTypedMessage' as never,
      signTypedMessageMock,
    );

    successfulFetchMock.mockResolvedValue({
      json: async () => ({ status: 'ok' }),
    } as Response);
  });

  afterEach(() => {
    try {
      messenger.unregisterActionHandler(
        'KeyringController:signTypedMessage' as never,
      );
    } catch {
      // already unregistered
    }
  });

  it('throws if authorize step is missing', async () => {
    const quote = buildQuote([DEPOSIT_STEP_MOCK]);

    await expect(
      submitHyperliquidWithdraw(quote, FROM_MOCK, messenger),
    ).rejects.toThrow('Expected authorize and deposit steps');
  });

  it('throws if deposit step is missing', async () => {
    const quote = buildQuote([AUTHORIZE_STEP_MOCK]);

    await expect(
      submitHyperliquidWithdraw(quote, FROM_MOCK, messenger),
    ).rejects.toThrow('Expected authorize and deposit steps');
  });

  it('signs authorize EIP-712 message and posts to Relay', async () => {
    const quote = buildQuote();

    await submitHyperliquidWithdraw(quote, FROM_MOCK, messenger);

    expect(signTypedMessageMock).toHaveBeenCalledTimes(2);

    const authorizeCall = signTypedMessageMock.mock.calls[0];
    expect(authorizeCall[0]).toStrictEqual({
      from: FROM_MOCK,
      data: expect.any(String),
    });
    expect(authorizeCall[1]).toBe(SignTypedDataVersion.V4);

    const typedData = JSON.parse(authorizeCall[0].data);
    expect(typedData.domain).toStrictEqual(
      AUTHORIZE_STEP_MOCK.items[0].data.sign.domain,
    );
    expect(typedData.primaryType).toBe('Authorize');
    expect(typedData.types.EIP712Domain).toStrictEqual([
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
    ]);
  });

  it('posts authorize signature to Relay /authorize', async () => {
    const quote = buildQuote();

    await submitHyperliquidWithdraw(quote, FROM_MOCK, messenger);

    expect(successfulFetchMock).toHaveBeenCalledWith(
      `${RELAY_AUTHORIZE_URL}?signature=${SIGNATURE_MOCK}`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: 'req-1' }),
      }),
    );
  });

  it('signs deposit EIP-712 message with HyperliquidSignTransaction domain', async () => {
    const quote = buildQuote();

    await submitHyperliquidWithdraw(quote, FROM_MOCK, messenger);

    const depositCall = signTypedMessageMock.mock.calls[1];
    const typedData = JSON.parse(depositCall[0].data);

    expect(typedData.domain).toStrictEqual({
      name: 'HyperliquidSignTransaction',
      version: '1',
      chainId: 42161,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    });
    expect(typedData.primaryType).toBe('HyperliquidTransaction:UsdSend');
    expect(typedData.message).toStrictEqual({
      destination: '0xsolver',
      amount: '10000000',
      hyperliquidChain: 'Mainnet',
      type: 'usdSend',
      signatureChainId: '0xa4b1',
    });
  });

  it('posts deposit to HyperLiquid exchange with parsed r/s/v', async () => {
    const quote = buildQuote();

    await submitHyperliquidWithdraw(quote, FROM_MOCK, messenger);

    const depositFetchCall = successfulFetchMock.mock.calls[1];
    expect(depositFetchCall[0]).toBe(HYPERLIQUID_EXCHANGE_URL);

    const body = JSON.parse(depositFetchCall[1]?.body as string);
    expect(body.action).toStrictEqual({
      destination: '0xsolver',
      amount: '10000000',
      hyperliquidChain: 'Mainnet',
      type: 'usdSend',
      signatureChainId: '0xa4b1',
    });
    expect(body.nonce).toBe(1234567890000);
    expect(body.signature.r).toBe(SIGNATURE_MOCK.slice(0, 66));
    expect(body.signature.s).toBe(`0x${SIGNATURE_MOCK.slice(66, 130)}`);
    expect(body.signature.v).toBe(0x1b);
  });

  it('throws if HyperLiquid deposit returns non-ok status', async () => {
    successfulFetchMock
      .mockResolvedValueOnce({
        json: async () => ({ status: 'ok' }),
      } as Response)
      .mockResolvedValueOnce({
        json: async () => ({ status: 'err', response: 'Insufficient balance' }),
      } as Response);

    const quote = buildQuote();

    await expect(
      submitHyperliquidWithdraw(quote, FROM_MOCK, messenger),
    ).rejects.toThrow('HyperLiquid deposit failed');
  });

  it('throws if authorize step has no items', async () => {
    const emptyAuthorize = {
      ...AUTHORIZE_STEP_MOCK,
      items: [],
    };

    const quote = buildQuote([emptyAuthorize, DEPOSIT_STEP_MOCK]);

    await expect(
      submitHyperliquidWithdraw(quote, FROM_MOCK, messenger),
    ).rejects.toThrow('Expected exactly 1 authorize item, got 0');
  });

  it('throws if deposit step has no items', async () => {
    const emptyDeposit = {
      ...DEPOSIT_STEP_MOCK,
      items: [],
    };

    const quote = buildQuote([AUTHORIZE_STEP_MOCK, emptyDeposit]);

    await expect(
      submitHyperliquidWithdraw(quote, FROM_MOCK, messenger),
    ).rejects.toThrow('Expected exactly 1 deposit item, got 0');
  });

  it('throws if authorize step has a sparse single item', async () => {
    const sparseAuthorize = {
      ...AUTHORIZE_STEP_MOCK,
      items: [undefined],
    };

    const quote = buildQuote([sparseAuthorize, DEPOSIT_STEP_MOCK]);

    await expect(
      submitHyperliquidWithdraw(quote, FROM_MOCK, messenger),
    ).rejects.toThrow('Authorize step has no items');
  });

  it('throws if deposit step has a sparse single item', async () => {
    const sparseDeposit = {
      ...DEPOSIT_STEP_MOCK,
      items: [undefined],
    };

    const quote = buildQuote([AUTHORIZE_STEP_MOCK, sparseDeposit]);

    await expect(
      submitHyperliquidWithdraw(quote, FROM_MOCK, messenger),
    ).rejects.toThrow('Deposit step has no items');
  });

  it('throws if authorize step has multiple items', async () => {
    const multiAuthorize = {
      ...AUTHORIZE_STEP_MOCK,
      items: [AUTHORIZE_STEP_MOCK.items[0], AUTHORIZE_STEP_MOCK.items[0]],
    };

    const quote = buildQuote([multiAuthorize, DEPOSIT_STEP_MOCK]);

    await expect(
      submitHyperliquidWithdraw(quote, FROM_MOCK, messenger),
    ).rejects.toThrow('Expected exactly 1 authorize item, got 2');
  });

  it('throws if deposit step has multiple items', async () => {
    const multiDeposit = {
      ...DEPOSIT_STEP_MOCK,
      items: [DEPOSIT_STEP_MOCK.items[0], DEPOSIT_STEP_MOCK.items[0]],
    };

    const quote = buildQuote([AUTHORIZE_STEP_MOCK, multiDeposit]);

    await expect(
      submitHyperliquidWithdraw(quote, FROM_MOCK, messenger),
    ).rejects.toThrow('Expected exactly 1 deposit item, got 2');
  });

  it('wraps authorize fetch errors with context', async () => {
    successfulFetchMock.mockRejectedValueOnce(new Error('Network timeout'));

    const quote = buildQuote();

    await expect(
      submitHyperliquidWithdraw(quote, FROM_MOCK, messenger),
    ).rejects.toThrow('HyperLiquid authorize failed: Network timeout');
  });

  it('wraps deposit fetch errors with context', async () => {
    successfulFetchMock
      .mockResolvedValueOnce({
        json: async () => ({ status: 'ok' }),
      } as Response)
      .mockRejectedValueOnce(new Error('Connection refused'));

    const quote = buildQuote();

    await expect(
      submitHyperliquidWithdraw(quote, FROM_MOCK, messenger),
    ).rejects.toThrow('HyperLiquid deposit failed: Connection refused');
  });

  it('wraps deposit JSON parse errors with context', async () => {
    successfulFetchMock
      .mockResolvedValueOnce({
        json: async () => ({ status: 'ok' }),
      } as Response)
      .mockResolvedValueOnce({
        json: async () => {
          throw new Error('Invalid JSON');
        },
      } as Response);

    const quote = buildQuote();

    await expect(
      submitHyperliquidWithdraw(quote, FROM_MOCK, messenger),
    ).rejects.toThrow('HyperLiquid deposit failed: Invalid JSON');
  });
});
