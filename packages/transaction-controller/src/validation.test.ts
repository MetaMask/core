import { rpcErrors } from '@metamask/rpc-errors';

import { validateTxParams } from './validation';

describe('validation', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateTxParams', () => {
    it('should throw if no from address', () => {
      expect(() => validateTxParams({} as any)).toThrow(
        rpcErrors.invalidParams(
          'Invalid "from" address: undefined must be a valid string.',
        ),
      );
    });

    it('should throw if non-string from address', () => {
      expect(() => validateTxParams({ from: 1337 } as any)).toThrow(
        rpcErrors.invalidParams(
          'Invalid "from" address: 1337 must be a valid string.',
        ),
      );
    });

    it('should throw if invalid from address', () => {
      expect(() => validateTxParams({ from: '1337' } as any)).toThrow(
        rpcErrors.invalidParams(
          'Invalid "from" address: 1337 must be a valid string.',
        ),
      );
    });

    it('should throw if no data', () => {
      expect(() =>
        validateTxParams({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x',
        } as any),
      ).toThrow(
        rpcErrors.invalidParams(
          'Invalid "to" address: 0x must be a valid string.',
        ),
      );

      expect(() =>
        validateTxParams({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
        } as any),
      ).toThrow(
        rpcErrors.invalidParams(
          'Invalid "to" address: undefined must be a valid string.',
        ),
      );
    });

    it('should delete data', () => {
      const transaction = {
        data: 'foo',
        from: '0x3244e191f1b4903970224322180f1fbbc415696b',
        to: '0x',
      };
      validateTxParams(transaction);
      expect(transaction.to).toBeUndefined();
    });

    it('should throw if invalid to address', () => {
      expect(() =>
        validateTxParams({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '1337',
        } as any),
      ).toThrow(
        rpcErrors.invalidParams(
          'Invalid "to" address: 1337 must be a valid string.',
        ),
      );
    });

    it('should throw if value is invalid', () => {
      expect(() =>
        validateTxParams({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x3244e191f1b4903970224322180f1fbbc415696b',
          value: '133-7',
        } as any),
      ).toThrow(
        rpcErrors.invalidParams(
          'Invalid "value": 133-7 is not a positive number.',
        ),
      );

      expect(() =>
        validateTxParams({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x3244e191f1b4903970224322180f1fbbc415696b',
          value: '133.7',
        } as any),
      ).toThrow(
        rpcErrors.invalidParams(
          'Invalid "value": 133.7 number must be denominated in wei.',
        ),
      );

      expect(() =>
        validateTxParams({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x3244e191f1b4903970224322180f1fbbc415696b',
          value: 'hello',
        } as any),
      ).toThrow(
        rpcErrors.invalidParams(
          'Invalid "value": hello number must be a valid number.',
        ),
      );

      expect(() =>
        validateTxParams({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x3244e191f1b4903970224322180f1fbbc415696b',
          value: 'one million dollar$',
        } as any),
      ).toThrow(
        rpcErrors.invalidParams(
          'Invalid "value": one million dollar$ number must be a valid number.',
        ),
      );

      expect(() =>
        util.validateTxParams({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x3244e191f1b4903970224322180f1fbbc415696b',
          value: '1',
          chainId: {},
        } as any),
      ).toThrow(
        rpcErrors.invalidParams(
          'Invalid transaction params: chainId is not a Number or hex string. got: ([object Object])',
        ),
      );

      expect(() =>
        validateTxParams({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x3244e191f1b4903970224322180f1fbbc415696b',
          value: '1',
        } as any),
      ).not.toThrow();
    });

    it('throws if params specifies an EIP-1559 transaction but the current network does not support EIP-1559', () => {
      expect(() =>
        validateTxParams(
          {
            from: '0x3244e191f1b4903970224322180f1fbbc415696b',
            maxFeePerGas: '2',
            maxPriorityFeePerGas: '3',
          } as any,
          false,
        ),
      ).toThrow(
        rpcErrors.invalidParams(
          'Invalid transaction params: params specify an EIP-1559 transaction but the current network does not support EIP-1559',
        ),
      );
    });

    it('throws if data is invalid', () => {
      expect(() =>
        validateTxParams({
          from: '0x1678a085c290ebd122dc42cba69373b5953b831d',
          to: '0xfbb5595c18ca76bab52d66188e4ca50c7d95f77a',
          data: '0xa9059cbb00000000000000000000000011b6A5fE2906F3354145613DB0d99CEB51f604C90000000000000000000000000000000000000000000000004563918244F400',
        } as any),
      ).toThrow(
        rpcErrors.invalidParams(
          'Invalid transaction params: data out-of-bounds, BUFFER_OVERRUN.',
        ),
      );

      expect(() =>
        validateTxParams({
          from: '0x1678a085c290ebd122dc42cba69373b5953b831d',
          value: '0x01',
          data: 'INVALID_ARGUMENT',
        } as any),
      ).not.toThrow();
    });
  });
});
