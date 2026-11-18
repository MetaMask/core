import { cloneDeep } from 'lodash-es';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mocked } from 'vitest';

import { VALUE_ZERO } from '../constants.js';
import type { BundlerEstimateUserOperationGasResponse } from '../helpers/Bundler.js';
import { Bundler } from '../helpers/Bundler.js';
import type {
  PrepareUserOperationResponse,
  UserOperationMetadata,
} from '../types.js';
import { updateGas } from './gas.js';

vi.mock('../helpers/Bundler', () => ({
  Bundler: vi.fn(),
}));

const ENTRYPOINT_MOCK = '0x789';

const METADATA_MOCK = {
  userOperation: {},
} as UserOperationMetadata;

const PREPARE_USER_OPERATION_RESPONSE_MOCK = {} as PrepareUserOperationResponse;

const ESTIMATE_RESPONSE_DECIMAL_MOCK: BundlerEstimateUserOperationGasResponse =
  {
    callGasLimit: 123,
    preVerificationGas: 456,
    verificationGasLimit: 789,
  };

const ESTIMATE_RESPONSE_HEX_MOCK: BundlerEstimateUserOperationGasResponse = {
  callGasLimit: '0x7B',
  preVerificationGas: '0x1C8',
  verificationGasLimit: '0x315',
};

/**
 * Creates a mock bundler.
 *
 * @returns The mock bundler.
 */
function createBundlerMock() {
  return {
    estimateUserOperationGas: vi.fn(),
    sendUserOperation: vi.fn(),
  } as unknown as Mocked<Bundler>;
}

describe('gas', () => {
  const bundlerConstructorMck = vi.mocked(Bundler);
  let metadata: UserOperationMetadata;
  let prepareUserOperationResponse: PrepareUserOperationResponse;
  const bundlerMock = createBundlerMock();

  /**
   * Invoke the updateGas function with the mock data.
   */
  async function callUpdateGas() {
    await updateGas(metadata, prepareUserOperationResponse, ENTRYPOINT_MOCK);
  }

  beforeEach(() => {
    metadata = cloneDeep(METADATA_MOCK);

    prepareUserOperationResponse = cloneDeep(
      PREPARE_USER_OPERATION_RESPONSE_MOCK,
    );

    bundlerConstructorMck.mockImplementation(function () {
      return bundlerMock;
    });
  });

  describe('updateGas', () => {
    it('uses prepare response gas values if set', async () => {
      prepareUserOperationResponse.gas = {
        callGasLimit: '0x1',
        preVerificationGas: '0x2',
        verificationGasLimit: '0x3',
      };

      await callUpdateGas();

      expect(metadata.userOperation.callGasLimit).toBe('0x1');
      expect(metadata.userOperation.preVerificationGas).toBe('0x2');
      expect(metadata.userOperation.verificationGasLimit).toBe('0x3');
      expect(bundlerConstructorMck).not.toHaveBeenCalled();
      expect(bundlerMock.estimateUserOperationGas).not.toHaveBeenCalled();
    });

    describe('estimates gas', () => {
      it('using bundler', async () => {
        bundlerMock.estimateUserOperationGas.mockResolvedValue(
          ESTIMATE_RESPONSE_DECIMAL_MOCK,
        );

        await callUpdateGas();

        expect(bundlerMock.estimateUserOperationGas).toHaveBeenCalledTimes(1);
        expect(bundlerMock.estimateUserOperationGas).toHaveBeenCalledWith(
          {
            ...metadata.userOperation,
            maxFeePerGas: VALUE_ZERO,
            maxPriorityFeePerGas: VALUE_ZERO,
            callGasLimit: VALUE_ZERO,
            preVerificationGas: VALUE_ZERO,
            verificationGasLimit: '0xF4240',
          },
          ENTRYPOINT_MOCK,
        );
      });

      it('if estimates are numbers', async () => {
        bundlerMock.estimateUserOperationGas.mockResolvedValue(
          ESTIMATE_RESPONSE_DECIMAL_MOCK,
        );

        await callUpdateGas();

        expect(metadata.userOperation).toStrictEqual(
          expect.objectContaining({
            // Estimated values multiplied by gas buffer and converted to hexadecimal.
            callGasLimit: '0xb8',
            preVerificationGas: '0x2ac',
            verificationGasLimit: '0x49f',
          }),
        );
      });

      it('if estimates are hexadecimal strings', async () => {
        bundlerMock.estimateUserOperationGas.mockResolvedValue(
          ESTIMATE_RESPONSE_HEX_MOCK,
        );

        await callUpdateGas();

        expect(metadata.userOperation).toStrictEqual(
          expect.objectContaining({
            // Estimated values multiplied by gas buffer and converted to hexadecimal.
            callGasLimit: '0xb8',
            preVerificationGas: '0x2ac',
            verificationGasLimit: '0x49f',
          }),
        );
      });

      it.each([
        0,
        1,
        100_000_000,
        2 ** 26 - 1,
        2 ** 26,
        2 ** 26 + 1,
        2 ** 27,
        2 ** 52 - 1,
        2 ** 52,
        2 ** 52 + 1,
        '0x20000000000001',
        '0x1010000000000003',
      ])(
        'buffers all gas estimates without losing precision for %s',
        async (rawValue) => {
          bundlerMock.estimateUserOperationGas.mockResolvedValue({
            callGasLimit: rawValue,
            preVerificationGas: rawValue,
            verificationGasLimit: rawValue,
          });

          await callUpdateGas();

          const expected = (BigInt(rawValue) * 3n) / 2n;
          expect(BigInt(metadata.userOperation.callGasLimit)).toBe(expected);
          expect(BigInt(metadata.userOperation.preVerificationGas)).toBe(
            expected,
          );
          expect(BigInt(metadata.userOperation.verificationGasLimit)).toBe(
            expected,
          );
        },
      );

      it('preserves a zero verificationGasLimit instead of using verificationGas', async () => {
        bundlerMock.estimateUserOperationGas.mockResolvedValue({
          ...ESTIMATE_RESPONSE_DECIMAL_MOCK,
          verificationGasLimit: 0,
          verificationGas: 100_000_000,
        });

        await callUpdateGas();

        expect(metadata.userOperation.verificationGasLimit).toBe('0x0');
      });

      it('using verificationGas if verificationGasLimit is undefined', async () => {
        bundlerMock.estimateUserOperationGas.mockResolvedValue({
          ...ESTIMATE_RESPONSE_HEX_MOCK,
          verificationGas: ESTIMATE_RESPONSE_HEX_MOCK.verificationGasLimit,
          verificationGasLimit: undefined,
        });

        await callUpdateGas();

        expect(metadata.userOperation).toStrictEqual(
          expect.objectContaining({
            verificationGasLimit: '0x49f',
          }),
        );
      });
    });
  });
});
