import { cloneDeep } from 'lodash';

import { VALUE_ZERO } from '../constants';
import type { BundlerEstimateUserOperationGasResponse } from '../helpers/Bundler';
import { Bundler } from '../helpers/Bundler';
import type {
  PrepareUserOperationResponse,
  UserOperationMetadata,
} from '../types';
import { updateGas } from './gas';

jest.mock('../helpers/Bundler', () => ({
  Bundler: jest.fn(),
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
 * @returns The mock bundler.
 */
function createBundlerMock() {
  return {
    estimateUserOperationGas: jest.fn(),
    sendUserOperation: jest.fn(),
  } as unknown as jest.Mocked<Bundler>;
}

describe('gas', () => {
  const bundlerConstructorMck = jest.mocked(Bundler);
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

    bundlerConstructorMck.mockReturnValue(bundlerMock);
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
