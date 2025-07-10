import EthQuery from '@metamask/eth-query';

import { DELEGATION_PREFIX } from './eip7702';
import { determineTransactionType } from './transaction-type';
import { FakeProvider } from '../../../../tests/fake-provider';
import { TransactionType } from '../types';

type GetCodeCallback = (err: Error | null, result?: string) => void;

/**
 * Creates a mock EthQuery instance for testing.
 *
 * @param getCodeResponse The response string to return from getCode, or undefined/null.
 * @param shouldThrow Whether getCode should throw an error instead of returning a response.
 * @returns An EthQuery instance with a mocked getCode method.
 */
function createMockEthQuery(
  getCodeResponse: string | undefined | null,
  shouldThrow = false,
): EthQuery {
  return new (class extends EthQuery {
    getCode(_to: string, cb: GetCodeCallback): void {
      if (shouldThrow) {
        return cb(new Error('Some error'));
      }
      return cb(null, getCodeResponse ?? undefined);
    }
  })(new FakeProvider());
}

describe('determineTransactionType', () => {
  const FROM_MOCK = '0x9e';
  const txParams = {
    to: '0x9e673399f795D01116e9A8B2dD2F156705131ee9',
    data: '0xa9059cbb0000000000000000000000002f318C334780961FB129D2a6c30D0763d9a5C970000000000000000000000000000000000000000000000000000000000000000a',
    from: FROM_MOCK,
  };

  it('returns a token transfer type when the recipient is a contract, there is no value passed, and data is for the respective method call', async () => {
    const result = await determineTransactionType(
      {
        to: '0x9e673399f795D01116e9A8B2dD2F156705131ee9',
        data: '0xa9059cbb0000000000000000000000002f318C334780961FB129D2a6c30D0763d9a5C970000000000000000000000000000000000000000000000000000000000000000a',
        from: FROM_MOCK,
      },
      createMockEthQuery('0xab'),
    );

    expect(result).toMatchObject({
      type: TransactionType.tokenMethodTransfer,
      getCodeResponse: '0xab',
    });
  });

  it(
    'does NOT return a token transfer type and instead returns contract interaction' +
      ' when the recipient is a contract, the data matches the respective method call, but there is a value passed',
    async () => {
      const resultWithEmptyValue = await determineTransactionType(
        txParams,

        createMockEthQuery('0xab'),
      );
      expect(resultWithEmptyValue).toMatchObject({
        type: TransactionType.tokenMethodTransfer,
        getCodeResponse: '0xab',
      });

      const resultWithEmptyValue2 = await determineTransactionType(
        {
          value: '0x0000',
          ...txParams,
        },

        createMockEthQuery('0xab'),
      );

      expect(resultWithEmptyValue2).toMatchObject({
        type: TransactionType.tokenMethodTransfer,
        getCodeResponse: '0xab',
      });

      const resultWithValue = await determineTransactionType(
        {
          value: '0x12345',
          ...txParams,
        },

        createMockEthQuery('0xab'),
      );
      expect(resultWithValue).toMatchObject({
        type: TransactionType.contractInteraction,
        getCodeResponse: '0xab',
      });
    },
  );

  it('does NOT return a token transfer type when the recipient is not a contract but the data matches the respective method call', async () => {
    const result = await determineTransactionType(
      txParams,
      createMockEthQuery('0x'),
    );
    expect(result).toMatchObject({
      type: TransactionType.simpleSend,
      getCodeResponse: '0x',
    });
  });

  it('does not identify contract codes with DELEGATION_PREFIX as contract addresses', async () => {
    const result = await determineTransactionType(
      {
        to: '0x9e673399f795D01116e9A8B2dD2F156705131ee9',
        data: '0xabd',
        from: FROM_MOCK,
      },
      createMockEthQuery(`${DELEGATION_PREFIX}1234567890abcdef`),
    );

    expect(result).toMatchObject({
      type: TransactionType.simpleSend,
      getCodeResponse: `${DELEGATION_PREFIX}1234567890abcdef`,
    });
  });

  it('returns a token approve type when the recipient is a contract and data is for the respective method call', async () => {
    const result = await determineTransactionType(
      {
        ...txParams,
        data: '0x095ea7b30000000000000000000000002f318C334780961FB129D2a6c30D0763d9a5C9700000000000000000000000000000000000000000000000000000000000000005',
      },
      createMockEthQuery('0xab'),
    );
    expect(result).toMatchObject({
      type: TransactionType.tokenMethodApprove,
      getCodeResponse: '0xab',
    });
  });

  it('returns a token approve type when data is uppercase', async () => {
    const result = await determineTransactionType(
      {
        ...txParams,
        data: '0x095EA7B30000000000000000000000002f318C334780961FB129D2a6c30D0763d9a5C9700000000000000000000000000000000000000000000000000000000000000005',
      },
      createMockEthQuery('0xab'),
    );
    expect(result).toMatchObject({
      type: TransactionType.tokenMethodApprove,
      getCodeResponse: '0xab',
    });
  });

  it('returns a contract deployment type when "to" is falsy and there is data', async () => {
    const result = await determineTransactionType(
      {
        ...txParams,
        to: '',
        data: '0xabd',
      },
      createMockEthQuery(''),
    );
    expect(result).toMatchObject({
      type: TransactionType.deployContract,
      getCodeResponse: undefined,
    });
  });

  it('returns a simple send type with a 0x getCodeResponse when there is data, but the "to" address is not a contract address', async () => {
    const result = await determineTransactionType(
      {
        ...txParams,
        data: '0xabd',
      },
      createMockEthQuery('0x'),
    );
    expect(result).toMatchObject({
      type: TransactionType.simpleSend,
      getCodeResponse: '0x',
    });
  });

  it('returns a simple send type with a null getCodeResponse when "to" is truthy and there is data, but getCode returns an error', async () => {
    const result = await determineTransactionType(
      {
        ...txParams,
        data: '0xabd',
      },
      createMockEthQuery(null, true),
    );
    expect(result).toMatchObject({
      type: TransactionType.simpleSend,
      getCodeResponse: null,
    });
  });

  it('returns a contract interaction type with the correct getCodeResponse when "to" is truthy and there is data, and it is not a token transaction', async () => {
    const result = await determineTransactionType(
      {
        ...txParams,
        data: 'abd',
      },
      createMockEthQuery('0xa'),
    );
    expect(result).toMatchObject({
      type: TransactionType.contractInteraction,
      getCodeResponse: '0xa',
    });
  });

  it('returns a contract interaction type with the correct getCodeResponse when "to" is a contract address and data is falsy', async () => {
    const result = await determineTransactionType(
      {
        ...txParams,
        data: '',
      },
      createMockEthQuery('0xa'),
    );
    expect(result).toMatchObject({
      type: TransactionType.contractInteraction,
      getCodeResponse: '0xa',
    });
  });

  it('returns contractInteraction for send with approve', async () => {
    const result = await determineTransactionType(
      {
        ...txParams,
        value: '0x5af3107a4000',
        data: '0x095ea7b30000000000000000000000002f318C334780961FB129D2a6c30D0763d9a5C9700000000000000000000000000000000000000000000000000000000000000005',
      },
      createMockEthQuery('0xa'),
    );
    expect(result).toMatchObject({
      type: TransactionType.contractInteraction,
      getCodeResponse: '0xa',
    });
  });

  it('returns contractInteraction if data and no eth query provided', async () => {
    const result = await determineTransactionType({
      ...txParams,
      value: '0x5af3107a4000',
      data: '0x095ea7b30000000000000000000000002f318C334780961FB129D2a6c30D0763d9a5C9700000000000000000000000000000000000000000000000000000000000000005',
    });

    expect(result).toMatchObject({
      type: TransactionType.contractInteraction,
      getCodeResponse: undefined,
    });
  });
});
