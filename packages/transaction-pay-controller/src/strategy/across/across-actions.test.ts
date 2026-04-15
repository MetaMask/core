import { Interface } from '@ethersproject/abi';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import type { QuoteRequest } from '../../types';
import {
  buildAcrossActionFromCall,
  CREATE_PROXY_SIGNATURE,
  getAcrossDestination,
  getTransferRecipient,
  isExtractableOutputTokenTransferCall,
  SAFE_EXEC_TRANSACTION_SIGNATURE,
  TOKEN_TRANSFER_SIGNATURE,
} from './across-actions';

const TOKEN_TRANSFER_INTERFACE = new Interface([TOKEN_TRANSFER_SIGNATURE]);
const CREATE_PROXY_INTERFACE = new Interface([CREATE_PROXY_SIGNATURE]);
const SAFE_EXEC_TRANSACTION_INTERFACE = new Interface([
  SAFE_EXEC_TRANSACTION_SIGNATURE,
]);

const REQUEST_MOCK: QuoteRequest = {
  from: '0x1234567890123456789012345678901234567891' as Hex,
  sourceBalanceRaw: '10000000000000000000',
  sourceChainId: '0x1',
  sourceTokenAddress: '0xabc' as Hex,
  sourceTokenAmount: '1000000000000000000',
  targetAmountMinimum: '123',
  targetChainId: '0x2',
  targetTokenAddress: '0xdef' as Hex,
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const TRANSFER_RECIPIENT = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex;
const TRANSFER_TARGET = REQUEST_MOCK.targetTokenAddress;
const CREATE_PROXY_TARGET = '0xfac7fac7fac7fac7fac7fac7fac7fac7fac7fac7' as Hex;
const EXEC_TRANSACTION_TARGET =
  '0x5afe5afe5afe5afe5afe5afe5afe5afe5afe5afe' as Hex;

function buildTransferData(
  recipient: Hex = TRANSFER_RECIPIENT,
  amount = 1,
): Hex {
  return TOKEN_TRANSFER_INTERFACE.encodeFunctionData('transfer', [
    recipient,
    amount,
  ]) as Hex;
}

function buildCreateProxyData(): Hex {
  return CREATE_PROXY_INTERFACE.encodeFunctionData('createProxy', [
    ZERO_ADDRESS,
    '0',
    ZERO_ADDRESS,
    {
      r: `0x${'11'.repeat(32)}`,
      s: `0x${'22'.repeat(32)}`,
      v: 27,
    },
  ]) as Hex;
}

function buildExecTransactionData(): Hex {
  return SAFE_EXEC_TRANSACTION_INTERFACE.encodeFunctionData('execTransaction', [
    '0xc0ffee254729296a45a3885639AC7E10F9d54979',
    '0',
    '0x12345678',
    0,
    0,
    0,
    0,
    ZERO_ADDRESS,
    ZERO_ADDRESS,
    '0xabcdef',
  ]) as Hex;
}

describe('across-actions', () => {
  it('builds transfer actions with a dynamic output-token amount', () => {
    expect(
      buildAcrossActionFromCall({ data: buildTransferData() }, REQUEST_MOCK),
    ).toStrictEqual({
      args: [
        {
          populateDynamically: false,
          value: TRANSFER_RECIPIENT.toLowerCase(),
        },
        {
          balanceSourceToken: REQUEST_MOCK.targetTokenAddress,
          populateDynamically: true,
          value: '0',
        },
      ],
      functionSignature: TOKEN_TRANSFER_SIGNATURE,
      isNativeTransfer: false,
      target: REQUEST_MOCK.targetTokenAddress,
      value: '0',
    });

    expect(
      buildAcrossActionFromCall(
        {
          data: buildTransferData(),
          target: TRANSFER_TARGET,
        },
        REQUEST_MOCK,
      ).target,
    ).toBe(TRANSFER_TARGET);
  });

  it('builds non-transfer actions by decoding the supported signature registry', () => {
    expect(
      buildAcrossActionFromCall(
        {
          data: buildExecTransactionData(),
          target: EXEC_TRANSACTION_TARGET,
        },
        REQUEST_MOCK,
      ),
    ).toMatchObject({
      functionSignature: SAFE_EXEC_TRANSACTION_SIGNATURE,
      target: EXEC_TRANSACTION_TARGET,
      value: '0',
    });
  });

  it('builds an Across destination directly from a transfer transaction', () => {
    expect(
      getAcrossDestination(
        {
          txParams: {
            data: buildTransferData(),
            from: REQUEST_MOCK.from,
          },
        } as TransactionMeta,
        REQUEST_MOCK,
      ),
    ).toStrictEqual({
      actions: [],
      recipient: TRANSFER_RECIPIENT.toLowerCase(),
    });
  });

  it('prefers nested destination calls over top-level calldata', () => {
    expect(
      getAcrossDestination(
        {
          nestedTransactions: [
            {
              data: buildTransferData(),
              to: TRANSFER_TARGET,
            },
          ],
          txParams: {
            data: buildCreateProxyData(),
            from: REQUEST_MOCK.from,
            to: CREATE_PROXY_TARGET,
          },
        } as TransactionMeta,
        REQUEST_MOCK,
      ),
    ).toStrictEqual({
      actions: [],
      recipient: TRANSFER_RECIPIENT.toLowerCase(),
    });
  });

  it('throws when decoding a supported action that requires a target without one', () => {
    expect(() =>
      buildAcrossActionFromCall({ data: buildCreateProxyData() }, REQUEST_MOCK),
    ).toThrow(/Across only supports direct token transfers/u);
  });

  it('throws when the calldata does not match a supported signature', () => {
    expect(() =>
      buildAcrossActionFromCall(
        {
          data: '0xdeadbeef' as Hex,
          target: CREATE_PROXY_TARGET,
        },
        REQUEST_MOCK,
      ),
    ).toThrow(/Destination selector: 0xdeadbeef/u);
  });

  it('extracts and normalizes transfer recipients from calldata', () => {
    expect(getTransferRecipient(buildTransferData())).toBe(
      TRANSFER_RECIPIENT.toLowerCase(),
    );
  });

  it('throws when asking for a transfer recipient from non-transfer calldata', () => {
    expect(() => getTransferRecipient(buildCreateProxyData())).toThrow(
      /Across only supports direct token transfers/u,
    );
  });

  it('recognizes extractable output-token transfers', () => {
    expect(
      isExtractableOutputTokenTransferCall(
        {
          data: buildTransferData(),
          target: TRANSFER_TARGET,
        },
        REQUEST_MOCK,
      ),
    ).toBe(true);
  });

  it('rejects unsupported or non-output-token transfer calls as extractable recipients', () => {
    expect(
      isExtractableOutputTokenTransferCall(
        {
          data: buildTransferData(),
          target: '0x9999999999999999999999999999999999999999' as Hex,
        },
        REQUEST_MOCK,
      ),
    ).toBe(false);

    expect(
      isExtractableOutputTokenTransferCall(
        {
          data: '0xdeadbeef' as Hex,
          target: TRANSFER_TARGET,
        },
        REQUEST_MOCK,
      ),
    ).toBe(false);
  });
});
