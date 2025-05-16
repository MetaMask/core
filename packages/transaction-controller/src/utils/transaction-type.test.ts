import EthQuery from '@metamask/eth-query';

import { determineTransactionType } from './transaction-type';
import { FakeProvider } from '../../../../tests/fake-provider';
import { TransactionType } from '../types';
import { DELEGATION_PREFIX } from './eip7702';

describe('determineTransactionType', () => {
  const FROM_MOCK = '0x9e';
  const txParams = {
    to: '0x9e673399f795D01116e9A8B2dD2F156705131ee9',
    data: '0xa9059cbb0000000000000000000000002f318C334780961FB129D2a6c30D0763d9a5C970000000000000000000000000000000000000000000000000000000000000000a',
    from: FROM_MOCK,
  };

  it('returns a token transfer type when the recipient is a contract, there is no value passed, and data is for the respective method call', async () => {
    class MockEthQuery extends EthQuery {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getCode(_to: any, cb: any) {
        cb(null, '0xab');
      }
    }
    const result = await determineTransactionType(
      {
        to: '0x9e673399f795D01116e9A8B2dD2F156705131ee9',
        data: '0xa9059cbb0000000000000000000000002f318C334780961FB129D2a6c30D0763d9a5C970000000000000000000000000000000000000000000000000000000000000000a',
        from: FROM_MOCK,
      },
      new MockEthQuery(new FakeProvider()),
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
      class MockEthQuery extends EthQuery {
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getCode(_to: any, cb: any) {
          cb(null, '0xab');
        }
      }
      const resultWithEmptyValue = await determineTransactionType(
        txParams,

        new MockEthQuery(new FakeProvider()),
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

        new MockEthQuery(new FakeProvider()),
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

        new MockEthQuery(new FakeProvider()),
      );
      expect(resultWithValue).toMatchObject({
        type: TransactionType.contractInteraction,
        getCodeResponse: '0xab',
      });
    },
  );

  it('does NOT return a token transfer type when the recipient is not a contract but the data matches the respective method call', async () => {
    class MockEthQuery extends EthQuery {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getCode(_to: any, cb: any) {
        cb(null, '0x');
      }
    }
    const result = await determineTransactionType(
      txParams,
      new MockEthQuery(new FakeProvider()),
    );
    expect(result).toMatchObject({
      type: TransactionType.simpleSend,
      getCodeResponse: '0x',
    });
  });

  it('does not identify contract codes with DELEGATION_PREFIX as contract addresses', async () => {
    class MockEthQuery extends EthQuery {
      getCode(_to: any, cb: any) {
        // Return a code starting with the DELEGATION_PREFIX
        cb(null, DELEGATION_PREFIX + '1234567890abcdef');
      }
    }
    
    const result = await determineTransactionType(
      {
        to: '0x9e673399f795D01116e9A8B2dD2F156705131ee9',
        data: '0xabd',
        from: FROM_MOCK,
      },
      new MockEthQuery(new FakeProvider())
    );
    
    expect(result).toMatchObject({
      type: TransactionType.simpleSend,
      getCodeResponse: DELEGATION_PREFIX + '1234567890abcdef',
    });
  });

  it('returns a token approve type when the recipient is a contract and data is for the respective method call', async () => {
    class MockEthQuery extends EthQuery {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getCode(_to: any, cb: any) {
        cb(null, '0xab');
      }
    }
    const result = await determineTransactionType(
      {
        ...txParams,
        data: '0x095ea7b30000000000000000000000002f318C334780961FB129D2a6c30D0763d9a5C9700000000000000000000000000000000000000000000000000000000000000005',
      },
      new MockEthQuery(new FakeProvider()),
    );
    expect(result).toMatchObject({
      type: TransactionType.tokenMethodApprove,
      getCodeResponse: '0xab',
    });
  });

  it('returns a contract deployment type when "to" is falsy and there is data', async () => {
    class MockEthQuery extends EthQuery {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getCode(_to: any, cb: any) {
        cb(null, '');
      }
    }
    const result = await determineTransactionType(
      {
        ...txParams,
        to: '',
        data: '0xabd',
      },
      new MockEthQuery(new FakeProvider()),
    );
    expect(result).toMatchObject({
      type: TransactionType.deployContract,
      getCodeResponse: undefined,
    });
  });

  it('returns a simple send type with a 0x getCodeResponse when there is data, but the "to" address is not a contract address', async () => {
    class MockEthQuery extends EthQuery {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getCode(_to: any, cb: any) {
        cb(null, '0x');
      }
    }
    const result = await determineTransactionType(
      {
        ...txParams,
        data: '0xabd',
      },
      new MockEthQuery(new FakeProvider()),
    );
    expect(result).toMatchObject({
      type: TransactionType.simpleSend,
      getCodeResponse: '0x',
    });
  });

  it('returns a simple send type with a null getCodeResponse when "to" is truthy and there is data, but getCode returns an error', async () => {
    class MockEthQuery extends EthQuery {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getCode(_to: any, cb: any) {
        cb(new Error('Some error'));
      }
    }
    const result = await determineTransactionType(
      {
        ...txParams,
        data: '0xabd',
      },
      new MockEthQuery(new FakeProvider()),
    );
    expect(result).toMatchObject({
      type: TransactionType.simpleSend,
      getCodeResponse: null,
    });
  });

  it('returns a contract interaction type with the correct getCodeResponse when "to" is truthy and there is data, and it is not a token transaction', async () => {
    class MockEthQuery extends EthQuery {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getCode(_to: any, cb: any) {
        cb(null, '0xa');
      }
    }
    const result = await determineTransactionType(
      {
        ...txParams,
        data: 'abd',
      },
      new MockEthQuery(new FakeProvider()),
    );
    expect(result).toMatchObject({
      type: TransactionType.contractInteraction,
      getCodeResponse: '0xa',
    });
  });

  it('returns a contract interaction type with the correct getCodeResponse when "to" is a contract address and data is falsy', async () => {
    class MockEthQuery extends EthQuery {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getCode(_to: any, cb: any) {
        cb(null, '0xa');
      }
    }
    const result = await determineTransactionType(
      {
        ...txParams,
        data: '',
      },
      new MockEthQuery(new FakeProvider()),
    );
    expect(result).toMatchObject({
      type: TransactionType.contractInteraction,
      getCodeResponse: '0xa',
    });
  });

  it('returns contractInteraction for send with approve', async () => {
    class MockEthQuery extends EthQuery {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getCode(_to: any, cb: any) {
        cb(null, '0xa');
      }
    }

    const result = await determineTransactionType(
      {
        ...txParams,
        value: '0x5af3107a4000',
        data: '0x095ea7b30000000000000000000000002f318C334780961FB129D2a6c30D0763d9a5C9700000000000000000000000000000000000000000000000000000000000000005',
      },
      new MockEthQuery(new FakeProvider()),
    );
    expect(result).toMatchObject({
      type: TransactionType.contractInteraction,
      getCodeResponse: '0xa',
    });
  });
});
