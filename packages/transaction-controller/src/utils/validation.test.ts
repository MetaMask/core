import { rpcErrors } from '@metamask/rpc-errors';

import { TransactionEnvelopeType } from '../types';
import { validateTxParams } from './validation';

describe('validation', () => {
  describe('validateTxParams', () => {
    it('should throw if no from address', () => {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => validateTxParams({} as any)).toThrow(
        rpcErrors.invalidParams(
          'Invalid "from" address undefined: not a string.',
        ),
      );
    });

    it('should throw if non-string from address', () => {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => validateTxParams({ from: 1337 } as any)).toThrow(
        rpcErrors.invalidParams('Invalid "from" address 1337: not a string.'),
      );
    });

    it('should throw if invalid from address', () => {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => validateTxParams({ from: '1337' } as any)).toThrow(
        rpcErrors.invalidParams('Invalid "from" address.'),
      );
    });

    it('should throw if no data', () => {
      expect(() =>
        validateTxParams({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x',
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).toThrow(rpcErrors.invalidParams('Invalid "to" address.'));

      expect(() =>
        validateTxParams({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).toThrow(rpcErrors.invalidParams('Invalid "to" address.'));
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
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).toThrow(rpcErrors.invalidParams('Invalid "to" address.'));
    });

    it('should throw if value is invalid', () => {
      expect(() =>
        validateTxParams({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x3244e191f1b4903970224322180f1fbbc415696b',
          value: '133-7',
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).toThrow(
        rpcErrors.invalidParams(
          'Invalid transaction value "133-7": not a positive number.',
        ),
      );

      expect(() =>
        validateTxParams({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x3244e191f1b4903970224322180f1fbbc415696b',
          value: '133.7',
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).toThrow(
        rpcErrors.invalidParams(
          'Invalid transaction value "133.7": number must be in wei.',
        ),
      );

      expect(() =>
        validateTxParams({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x3244e191f1b4903970224322180f1fbbc415696b',
          value: 'hello',
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).toThrow(
        rpcErrors.invalidParams(
          'Invalid transaction value hello: number must be a valid number.',
        ),
      );

      expect(() =>
        validateTxParams({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x3244e191f1b4903970224322180f1fbbc415696b',
          value: 'one million dollar$',
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).toThrow(
        rpcErrors.invalidParams(
          'Invalid transaction value one million dollar$: number must be a valid number.',
        ),
      );

      expect(() =>
        validateTxParams({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x3244e191f1b4903970224322180f1fbbc415696b',
          value: '1',
          chainId: {},
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).not.toThrow();
    });

    describe('gas fees', () => {
      it('throws if gasPrice is defined but type is feeMarket', () => {
        expect(() =>
          validateTxParams({
            from: '0x1678a085c290ebd122dc42cba69373b5953b831d',
            to: '0xfbb5595c18ca76bab52d66188e4ca50c7d95f77a',
            gasPrice: '0x01',
            type: TransactionEnvelopeType.feeMarket,
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any),
        ).toThrow(
          rpcErrors.invalidParams(
            'Invalid transaction envelope type: specified type "0x2" but included a gasPrice instead of maxFeePerGas and maxPriorityFeePerGas',
          ),
        );
        expect(() =>
          validateTxParams({
            from: '0x1678a085c290ebd122dc42cba69373b5953b831d',
            to: '0xfbb5595c18ca76bab52d66188e4ca50c7d95f77a',
            gasPrice: '0x01',
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any),
        ).not.toThrow();
      });

      it('throws if gasPrice is defined along with maxFeePerGas or maxPriorityFeePerGas', () => {
        expect(() =>
          validateTxParams({
            from: '0x1678a085c290ebd122dc42cba69373b5953b831d',
            to: '0xfbb5595c18ca76bab52d66188e4ca50c7d95f77a',
            gasPrice: '0x01',
            maxFeePerGas: '0x01',
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any),
        ).toThrow(
          rpcErrors.invalidParams(
            'Invalid transaction params: specified gasPrice but also included maxFeePerGas, these cannot be mixed',
          ),
        );

        expect(() =>
          validateTxParams({
            from: '0x1678a085c290ebd122dc42cba69373b5953b831d',
            to: '0xfbb5595c18ca76bab52d66188e4ca50c7d95f77a',
            gasPrice: '0x01',
            maxPriorityFeePerGas: '0x01',
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any),
        ).toThrow(
          rpcErrors.invalidParams(
            'Invalid transaction params: specified gasPrice but also included maxPriorityFeePerGas, these cannot be mixed',
          ),
        );
      });

      it('throws if gasPrice, maxPriorityFeePerGas or maxFeePerGas is not string', () => {
        expect(() =>
          validateTxParams({
            from: '0x1678a085c290ebd122dc42cba69373b5953b831d',
            to: '0xfbb5595c18ca76bab52d66188e4ca50c7d95f77a',
            gasPrice: 1,
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any),
        ).toThrow(
          rpcErrors.invalidParams(
            'Invalid transaction params: gasPrice is not a string. got: (1)',
          ),
        );

        expect(() =>
          validateTxParams({
            from: '0x1678a085c290ebd122dc42cba69373b5953b831d',
            to: '0xfbb5595c18ca76bab52d66188e4ca50c7d95f77a',
            maxPriorityFeePerGas: 1,
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any),
        ).toThrow(
          rpcErrors.invalidParams(
            'Invalid transaction params: maxPriorityFeePerGas is not a string. got: (1)',
          ),
        );

        expect(() =>
          validateTxParams({
            from: '0x1678a085c290ebd122dc42cba69373b5953b831d',
            to: '0xfbb5595c18ca76bab52d66188e4ca50c7d95f77a',
            maxFeePerGas: 1,
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any),
        ).toThrow(
          rpcErrors.invalidParams(
            'Invalid transaction params: maxFeePerGas is not a string. got: (1)',
          ),
        );
      });

      it('throws if maxPriorityFeePerGas is defined but type is not feeMarket', () => {
        expect(() =>
          validateTxParams({
            from: '0x1678a085c290ebd122dc42cba69373b5953b831d',
            to: '0xfbb5595c18ca76bab52d66188e4ca50c7d95f77a',
            maxPriorityFeePerGas: '0x01',
            type: TransactionEnvelopeType.accessList,
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any),
        ).toThrow(
          rpcErrors.invalidParams(
            'Invalid transaction envelope type: specified type "0x1" but including maxFeePerGas and maxPriorityFeePerGas requires type: "0x2"',
          ),
        );
        expect(() =>
          validateTxParams({
            from: '0x1678a085c290ebd122dc42cba69373b5953b831d',
            to: '0xfbb5595c18ca76bab52d66188e4ca50c7d95f77a',
            maxPriorityFeePerGas: '0x01',
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any),
        ).not.toThrow();
      });

      it('throws if maxFeePerGas is defined but type is not feeMarket', () => {
        expect(() =>
          validateTxParams({
            from: '0x1678a085c290ebd122dc42cba69373b5953b831d',
            to: '0xfbb5595c18ca76bab52d66188e4ca50c7d95f77a',
            maxFeePerGas: '0x01',
            type: TransactionEnvelopeType.accessList,
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any),
        ).toThrow(
          rpcErrors.invalidParams(
            'Invalid transaction envelope type: specified type "0x1" but including maxFeePerGas and maxPriorityFeePerGas requires type: "0x2"',
          ),
        );
        expect(() =>
          validateTxParams({
            from: '0x1678a085c290ebd122dc42cba69373b5953b831d',
            to: '0xfbb5595c18ca76bab52d66188e4ca50c7d95f77a',
            maxFeePerGas: '0x01',
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any),
        ).not.toThrow();
      });
    });
  });
});
