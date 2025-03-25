import { ORIGIN_METAMASK } from '@metamask/controller-utils';
import { rpcErrors } from '@metamask/rpc-errors';
import type { Hex } from '@metamask/utils';

import {
  validateBatchRequest,
  validateParamTo,
  validateTransactionOrigin,
  validateTxParams,
} from './validation';
import { TransactionEnvelopeType, TransactionType } from '../types';
import type { TransactionParams } from '../types';

const DATA_MOCK = '0x12345678';
const FROM_MOCK: Hex = '0x1678a085c290ebd122dc42cba69373b5953b831d';
const TO_MOCK: Hex = '0xfbb5595c18ca76bab52d66188e4ca50c7d95f77a';
const ORIGIN_MOCK = 'test-origin';

const VALIDATE_BATCH_REQUEST_MOCK = {
  internalAccounts: [],
  request: {
    from: FROM_MOCK,
    networkClientId: 'testNetworkClientId',
    origin: ORIGIN_MOCK,
    transactions: [
      {
        params: {
          to: '0xabc' as Hex,
        },
      },
      {
        params: {
          to: TO_MOCK,
        },
      },
    ],
  },
  sizeLimit: 2,
};

describe('validation', () => {
  describe('validateTxParams', () => {
    it('should throw if unknown transaction envelope type is specified', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => validateTxParams({ type: '0x3' } as any)).toThrow(
        rpcErrors.invalidParams(
          'Invalid transaction envelope type: "0x3". Must be one of: 0x0, 0x1, 0x2, 0x4',
        ),
      );
    });

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
          from: FROM_MOCK,
          to: '0x',
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).toThrow(rpcErrors.invalidParams('Invalid "to" address.'));

      expect(() =>
        validateTxParams({
          from: FROM_MOCK,
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).toThrow(rpcErrors.invalidParams('Invalid "to" address.'));
    });

    it('should delete data', () => {
      const transaction = {
        data: 'foo',
        from: TO_MOCK,
        to: '0x',
      };
      validateTxParams(transaction);
      expect(transaction.to).toBeUndefined();
    });

    it('should throw if invalid to address', () => {
      expect(() =>
        validateTxParams({
          from: FROM_MOCK,
          to: '1337',
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).toThrow(rpcErrors.invalidParams('Invalid "to" address.'));
    });

    it('should throw if value is invalid', () => {
      expect(() =>
        validateTxParams({
          from: FROM_MOCK,
          to: TO_MOCK,
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
          from: FROM_MOCK,
          to: TO_MOCK,
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
          from: FROM_MOCK,
          to: TO_MOCK,
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
          from: FROM_MOCK,
          to: TO_MOCK,
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
          from: FROM_MOCK,
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
            from: FROM_MOCK,
            to: TO_MOCK,
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
            from: FROM_MOCK,
            to: TO_MOCK,
            gasPrice: '0x01',
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any),
        ).not.toThrow();
      });

      it('throws if gasPrice is defined but type is setCode', () => {
        expect(() =>
          validateTxParams({
            from: FROM_MOCK,
            to: TO_MOCK,
            gasPrice: '0x01',
            type: TransactionEnvelopeType.setCode,
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any),
        ).toThrow(
          rpcErrors.invalidParams(
            'Invalid transaction envelope type: specified type "0x4" but included a gasPrice instead of maxFeePerGas and maxPriorityFeePerGas',
          ),
        );
        expect(() =>
          validateTxParams({
            from: FROM_MOCK,
            to: TO_MOCK,
            gasPrice: '0x01',
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any),
        ).not.toThrow();
      });

      it('throws if gasPrice is defined along with maxFeePerGas or maxPriorityFeePerGas', () => {
        expect(() =>
          validateTxParams({
            from: FROM_MOCK,
            to: TO_MOCK,
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
            from: FROM_MOCK,
            to: TO_MOCK,
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

      it('throws if gasPrice, maxPriorityFeePerGas or maxFeePerGas is not a valid hexadecimal string', () => {
        expect(() =>
          validateTxParams({
            from: FROM_MOCK,
            to: TO_MOCK,
            gasPrice: 1,
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any),
        ).toThrow(
          rpcErrors.invalidParams(
            'Invalid transaction params: gasPrice is not a valid hexadecimal string. got: (1)',
          ),
        );

        expect(() =>
          validateTxParams({
            from: FROM_MOCK,
            to: TO_MOCK,
            maxPriorityFeePerGas: 1,
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any),
        ).toThrow(
          rpcErrors.invalidParams(
            'Invalid transaction params: maxPriorityFeePerGas is not a valid hexadecimal string. got: (1)',
          ),
        );

        expect(() =>
          validateTxParams({
            from: FROM_MOCK,
            to: TO_MOCK,
            maxFeePerGas: 1,
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any),
        ).toThrow(
          rpcErrors.invalidParams(
            'Invalid transaction params: maxFeePerGas is not a valid hexadecimal string. got: (1)',
          ),
        );
      });

      it('throws if maxPriorityFeePerGas is defined but type is not feeMarket', () => {
        expect(() =>
          validateTxParams({
            from: FROM_MOCK,
            to: TO_MOCK,
            maxPriorityFeePerGas: '0x01',
            type: TransactionEnvelopeType.accessList,
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any),
        ).toThrow(
          rpcErrors.invalidParams(
            'Invalid transaction envelope type: specified type "0x1" but including maxFeePerGas and maxPriorityFeePerGas requires type: "0x2, 0x4"',
          ),
        );
        expect(() =>
          validateTxParams({
            from: FROM_MOCK,
            to: TO_MOCK,
            maxPriorityFeePerGas: '0x01',
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any),
        ).not.toThrow();
      });

      it('throws if maxFeePerGas is defined but type is not feeMarket', () => {
        expect(() =>
          validateTxParams({
            from: FROM_MOCK,
            to: TO_MOCK,
            maxFeePerGas: '0x01',
            type: TransactionEnvelopeType.accessList,
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any),
        ).toThrow(
          rpcErrors.invalidParams(
            'Invalid transaction envelope type: specified type "0x1" but including maxFeePerGas and maxPriorityFeePerGas requires type: "0x2, 0x4"',
          ),
        );
        expect(() =>
          validateTxParams({
            from: FROM_MOCK,
            to: TO_MOCK,
            maxFeePerGas: '0x01',
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any),
        ).not.toThrow();
      });

      it('throws if gasLimit is defined but not a valid hexadecimal', () => {
        expect(() =>
          validateTxParams({
            from: FROM_MOCK,
            to: TO_MOCK,
            maxFeePerGas: '0x01',
            gasLimit: 'zzzzz',
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any),
        ).toThrow(
          rpcErrors.invalidParams(
            'Invalid transaction params: gasLimit is not a valid hexadecimal string. got: (zzzzz)',
          ),
        );
        expect(() =>
          validateTxParams({
            from: FROM_MOCK,
            to: TO_MOCK,
            maxFeePerGas: '0x01',
            gasLimit: '0x0',
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any),
        ).not.toThrow();
      });

      it('throws if gas is defined but not a valid hexadecimal', () => {
        expect(() =>
          validateTxParams({
            from: FROM_MOCK,
            to: TO_MOCK,
            maxFeePerGas: '0x01',
            gas: 'zzzzz',
            // TODO: Replace `any` with type
          } as unknown as TransactionParams),
        ).toThrow(
          rpcErrors.invalidParams(
            'Invalid transaction params: gas is not a valid hexadecimal string. got: (zzzzz)',
          ),
        );
        expect(() =>
          validateTxParams({
            from: FROM_MOCK,
            to: TO_MOCK,
            maxFeePerGas: '0x01',
            gas: '0x0',
            // TODO: Replace `any` with type
          } as unknown as TransactionParams),
        ).not.toThrow();
      });
    });

    describe('authorizationList', () => {
      it('throws if type is not 0x4', () => {
        expect(() =>
          validateTxParams({
            authorizationList: [],
            from: FROM_MOCK,
            to: TO_MOCK,
            type: TransactionEnvelopeType.feeMarket,
          }),
        ).toThrow(
          rpcErrors.invalidParams(
            'Invalid transaction envelope type: specified type "0x2" but including authorizationList requires type: "0x4"',
          ),
        );
      });

      it('throws if not array', () => {
        expect(() =>
          validateTxParams({
            authorizationList: 123 as never,
            from: FROM_MOCK,
            to: TO_MOCK,
            type: TransactionEnvelopeType.setCode,
          }),
        ).toThrow(
          rpcErrors.invalidParams(
            'Invalid transaction params: authorizationList must be an array',
          ),
        );
      });

      it('throws if address missing', () => {
        expect(() =>
          validateTxParams({
            authorizationList: [
              {
                address: undefined as never,
              },
            ],
            from: FROM_MOCK,
            to: TO_MOCK,
            type: TransactionEnvelopeType.setCode,
          }),
        ).toThrow(
          rpcErrors.invalidParams(
            'Invalid transaction params: address is not a valid hexadecimal string. got: (undefined)',
          ),
        );
      });

      it('throws if address not hexadecimal string', () => {
        expect(() =>
          validateTxParams({
            authorizationList: [
              {
                address: 'test' as never,
              },
            ],
            from: FROM_MOCK,
            to: TO_MOCK,
            type: TransactionEnvelopeType.setCode,
          }),
        ).toThrow(
          rpcErrors.invalidParams(
            'Invalid transaction params: address is not a valid hexadecimal string. got: (test)',
          ),
        );
      });

      it('throws if address wrong length', () => {
        expect(() =>
          validateTxParams({
            authorizationList: [
              {
                address: FROM_MOCK.slice(0, -2) as never,
              },
            ],
            from: FROM_MOCK,
            to: TO_MOCK,
            type: TransactionEnvelopeType.setCode,
          }),
        ).toThrow(
          rpcErrors.invalidParams(
            'Invalid transaction params: address must be 20 bytes. got: 19 bytes',
          ),
        );
      });

      it.each(['chainId', 'nonce', 'r', 's'])(
        'throws if %s provided but not hexadecimal',
        (property) => {
          expect(() =>
            validateTxParams({
              authorizationList: [
                {
                  address: FROM_MOCK,
                  [property]: 'test' as never,
                },
              ],
              from: FROM_MOCK,
              to: TO_MOCK,
              type: TransactionEnvelopeType.setCode,
            }),
          ).toThrow(
            rpcErrors.invalidParams(
              `Invalid transaction params: ${property} is not a valid hexadecimal string. got: (test)`,
            ),
          );
        },
      );

      it('throws if yParity is not 0x or 0x1', () => {
        expect(() =>
          validateTxParams({
            authorizationList: [
              {
                address: FROM_MOCK,
                yParity: '0x2' as never,
              },
            ],
            from: FROM_MOCK,
            to: TO_MOCK,
            type: TransactionEnvelopeType.setCode,
          }),
        ).toThrow(
          rpcErrors.invalidParams(
            `Invalid transaction params: yParity must be '0x' or '0x1'. got: 0x2`,
          ),
        );
      });
    });
  });

  describe('validateTransactionOrigin', () => {
    it('throws if internal and from address not selected', async () => {
      await expect(
        validateTransactionOrigin({
          from: FROM_MOCK,
          origin: ORIGIN_METAMASK,
          permittedAddresses: undefined,
          selectedAddress: '0x123',
          txParams: {} as TransactionParams,
        }),
      ).rejects.toThrow(
        rpcErrors.invalidParams(
          'Internally initiated transaction is using invalid account.',
        ),
      );
    });

    it('does not throw if internal and from address is selected', async () => {
      expect(
        await validateTransactionOrigin({
          from: FROM_MOCK,
          origin: ORIGIN_METAMASK,
          permittedAddresses: undefined,
          selectedAddress: FROM_MOCK,
          txParams: {} as TransactionParams,
        }),
      ).toBeUndefined();
    });

    it('throws if external and from not permitted', async () => {
      await expect(
        validateTransactionOrigin({
          from: FROM_MOCK,
          origin: ORIGIN_MOCK,
          permittedAddresses: ['0x123', '0x456'],
          selectedAddress: '0x123',
          txParams: {} as TransactionParams,
        }),
      ).rejects.toThrow(
        rpcErrors.invalidParams(
          'The requested account and/or method has not been authorized by the user.',
        ),
      );
    });

    it('does not throw if external and from is permitted', async () => {
      expect(
        await validateTransactionOrigin({
          from: FROM_MOCK,
          origin: ORIGIN_MOCK,
          permittedAddresses: ['0x123', FROM_MOCK],
          selectedAddress: '0x123',
          txParams: {} as TransactionParams,
        }),
      ).toBeUndefined();
    });

    it('throws if external and type 4', async () => {
      await expect(
        validateTransactionOrigin({
          from: FROM_MOCK,
          origin: ORIGIN_MOCK,
          permittedAddresses: [FROM_MOCK],
          selectedAddress: '0x123',
          txParams: {
            type: TransactionEnvelopeType.setCode,
          } as TransactionParams,
        }),
      ).rejects.toThrow(
        rpcErrors.invalidParams(
          'External EIP-7702 transactions are not supported',
        ),
      );
    });

    it('throws if external and authorization list provided', async () => {
      await expect(
        validateTransactionOrigin({
          from: FROM_MOCK,
          origin: ORIGIN_MOCK,
          permittedAddresses: [FROM_MOCK],
          selectedAddress: '0x123',
          txParams: {
            authorizationList: [],
            from: TO_MOCK,
          } as TransactionParams,
        }),
      ).rejects.toThrow(
        rpcErrors.invalidParams(
          'External EIP-7702 transactions are not supported',
        ),
      );
    });

    it('throws if external and to is internal account and data', async () => {
      await expect(
        validateTransactionOrigin({
          data: DATA_MOCK,
          from: FROM_MOCK,
          internalAccounts: [TO_MOCK],
          origin: ORIGIN_MOCK,
          selectedAddress: '0x123',
          txParams: {
            to: TO_MOCK,
          } as TransactionParams,
        }),
      ).rejects.toThrow(
        rpcErrors.invalidParams(
          'External transactions to internal accounts cannot include data',
        ),
      );
    });

    it.each([
      ['undefined', undefined],
      ['empty', ''],
      ['empty hex', '0x'],
    ])(
      'does not throw if external and to is internal account but data is %s',
      async (_title, data) => {
        expect(
          await validateTransactionOrigin({
            data,
            from: FROM_MOCK,
            internalAccounts: [TO_MOCK],
            origin: ORIGIN_MOCK,
            selectedAddress: '0x123',
            txParams: {
              to: TO_MOCK,
            } as TransactionParams,
          }),
        ).toBeUndefined();
      },
    );

    it('does not throw if external and to is internal account but type is batch', async () => {
      expect(
        await validateTransactionOrigin({
          from: FROM_MOCK,
          internalAccounts: [TO_MOCK],
          origin: ORIGIN_MOCK,
          selectedAddress: '0x123',
          txParams: {
            to: TO_MOCK,
          } as TransactionParams,
          type: TransactionType.batch,
        }),
      ).toBeUndefined();
    });
  });

  describe('validateParamTo', () => {
    it('throws if no type', () => {
      expect(() => validateParamTo(undefined as never)).toThrow(
        rpcErrors.invalidParams('Invalid "to" address'),
      );
    });

    it('throws if type is not string', () => {
      expect(() => validateParamTo(123 as never)).toThrow(
        rpcErrors.invalidParams('Invalid "to" address'),
      );
    });
  });

  describe('validateBatchRequest', () => {
    it('throws if external origin and any transaction target is internal account', () => {
      expect(() =>
        validateBatchRequest({
          ...VALIDATE_BATCH_REQUEST_MOCK,
          internalAccounts: ['0x123', TO_MOCK],
        }),
      ).toThrow(
        rpcErrors.invalidParams('Calls to internal accounts are not supported'),
      );
    });

    it('does not throw if no origin and any transaction target is internal account', () => {
      expect(() =>
        validateBatchRequest({
          ...VALIDATE_BATCH_REQUEST_MOCK,
          internalAccounts: ['0x123', TO_MOCK],
          request: {
            ...VALIDATE_BATCH_REQUEST_MOCK.request,
            origin: undefined,
          },
        }),
      ).not.toThrow();
    });

    it('does not throw if internal origin and any transaction target is internal account', () => {
      expect(() =>
        validateBatchRequest({
          ...VALIDATE_BATCH_REQUEST_MOCK,
          internalAccounts: ['0x123', TO_MOCK],
          request: {
            ...VALIDATE_BATCH_REQUEST_MOCK.request,
            origin: ORIGIN_METAMASK,
          },
        }),
      ).not.toThrow();
    });

    it('throws if transaction count is greater than limit', () => {
      expect(() =>
        validateBatchRequest({
          ...VALIDATE_BATCH_REQUEST_MOCK,
          sizeLimit: 1,
        }),
      ).toThrow(rpcErrors.invalidParams('Batch size cannot exceed 1. got: 2'));
    });

    it('does not throw if transaction count is internal and greater than limit', () => {
      expect(() =>
        validateBatchRequest({
          ...VALIDATE_BATCH_REQUEST_MOCK,
          request: {
            ...VALIDATE_BATCH_REQUEST_MOCK.request,
            origin: ORIGIN_METAMASK,
          },
          sizeLimit: 1,
        }),
      ).not.toThrow();
    });
  });
});
