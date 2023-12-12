import { ApprovalType } from '@metamask/controller-utils';
import {
  determineTransactionType,
  TransactionType,
  type TransactionParams,
} from '@metamask/transaction-controller';
import { EventEmitter } from 'stream';

import { ADDRESS_ZERO, EMPTY_BYTES, ENTRYPOINT } from './constants';
import * as BundlerHelper from './helpers/Bundler';
import * as PendingUserOperationTrackerHelper from './helpers/PendingUserOperationTracker';
import type { UserOperationMetadata } from './types';
import {
  UserOperationStatus,
  type PrepareUserOperationResponse,
  type SignUserOperationResponse,
  type SmartContractAccount,
  type UpdateUserOperationResponse,
} from './types';
import type {
  AddUserOperationOptions,
  UserOperationControllerMessenger,
} from './UserOperationController';
import { UserOperationController } from './UserOperationController';
import {
  validateAddUserOperationRequest,
  validateAddUserOperationOptions,
  validatePrepareUserOperationResponse,
  validateSignUserOperationResponse,
  validateUpdateUserOperationResponse,
} from './utils/validation';

jest.mock('@metamask/transaction-controller');
jest.mock('./utils/validation');
jest.mock('./helpers/Bundler');
jest.mock('./helpers/PendingUserOperationTracker');

const CHAIN_ID_MOCK = '0x5';
const HASH_MOCK = '0x123';
const ERROR_MESSAGE_MOCK = 'Test Error';
const ERROR_CODE_MOCK = 1234;
const INTERVAL_MOCK = 1234;
const NETWORK_CLIENT_ID_MOCK = 'testNetworkClientId';
const TRANSACTION_HASH_MOCK = '0x456';
const ORIGIN_MOCK = 'test.com';

const USER_OPERATION_METADATA_MOCK: UserOperationMetadata = {
  chainId: CHAIN_ID_MOCK,
  id: 'testUserOperationId',
  status: UserOperationStatus.Confirmed,
} as any;

const PREPARE_USER_OPERATION_RESPONSE_MOCK: PrepareUserOperationResponse = {
  bundler: 'http://test.com',
  callData: '0x1',
  dummyPaymasterAndData: '0x2',
  dummySignature: '0x3',
  gas: {
    callGasLimit: '0x4',
    preVerificationGas: '0x5',
    verificationGasLimit: '0x6',
  },
  initCode: '0x7',
  nonce: '0x8',
  sender: '0x9',
};

const UPDATE_USER_OPERATION_RESPONSE_MOCK: UpdateUserOperationResponse = {
  paymasterAndData: '0xA',
};

const SIGN_USER_OPERATION_RESPONSE_MOCK: SignUserOperationResponse = {
  signature: '0xB',
};

const ADD_USER_OPERATION_REQUEST_MOCK = {
  data: '0x1',
  to: '0x2',
  value: '0x3',
  maxFeePerGas: '0x4',
  maxPriorityFeePerGas: '0x5',
};

const ADD_USER_OPERATION_OPTIONS_MOCK = {
  networkClientId: NETWORK_CLIENT_ID_MOCK,
  origin: ORIGIN_MOCK,
};

/**
 * Creates a mock user operation messenger.
 * @returns The mock user operation messenger.
 */
function createMessengerMock(): jest.Mocked<UserOperationControllerMessenger> {
  return {
    call: jest.fn(),
    publish: jest.fn(),
    registerActionHandler: jest.fn(),
  } as any;
}

/**
 * Creates a mock smart contract account.
 * @returns The mock smart contract account.
 */
function createSmartContractAccountMock(): jest.Mocked<SmartContractAccount> {
  return {
    prepareUserOperation: jest.fn(),
    updateUserOperation: jest.fn(),
    signUserOperation: jest.fn(),
  } as any;
}

/**
 * Creates a mock bundler.
 * @returns The mock bundler.
 */
function createBundlerMock(): jest.Mocked<BundlerHelper.Bundler> {
  return {
    estimateUserOperationGas: jest.fn(),
    sendUserOperation: jest.fn(),
  } as any;
}

/**
 * Creates a mock PendingUserOperationTracker.
 * @returns The mock PendingUserOperationTracker.
 */
function createPendingUserOperationTrackerMock(): jest.Mocked<PendingUserOperationTrackerHelper.PendingUserOperationTracker> {
  return {
    startPollingByNetworkClientId: jest.fn(),
    setIntervalLength: jest.fn(),
    hub: new EventEmitter(),
  } as any;
}

/**
 * Waits for all promises to resolve.
 */
async function flushPromises() {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('UserOperationController', () => {
  const messenger = createMessengerMock();
  const smartContractAccount = createSmartContractAccountMock();
  const bundlerMock = createBundlerMock();
  const pendingUserOperationTrackerMock =
    createPendingUserOperationTrackerMock();
  const approvalControllerAddRequestMock = jest.fn();
  const networkControllerGetClientByIdMock = jest.fn();
  const resultCallbackSuccessMock = jest.fn();
  const resultCallbackErrorMock = jest.fn();
  const determineTransactionTypeMock = jest.mocked(determineTransactionType);

  const validateAddUserOperationRequestMock = jest.mocked(
    validateAddUserOperationRequest,
  );

  const validateAddUserOperationOptionsMock = jest.mocked(
    validateAddUserOperationOptions,
  );

  const validatePrepareUserOperationResponseMock = jest.mocked(
    validatePrepareUserOperationResponse,
  );

  const validateUpdateUserOperationResponseMock = jest.mocked(
    validateUpdateUserOperationResponse,
  );

  const validateSignUserOperationResponseMock = jest.mocked(
    validateSignUserOperationResponse,
  );

  beforeEach(() => {
    jest.resetAllMocks();

    jest.spyOn(BundlerHelper, 'Bundler').mockReturnValue(bundlerMock);
    jest
      .spyOn(PendingUserOperationTrackerHelper, 'PendingUserOperationTracker')
      .mockReturnValue(pendingUserOperationTrackerMock);

    smartContractAccount.prepareUserOperation.mockResolvedValue(
      PREPARE_USER_OPERATION_RESPONSE_MOCK,
    );
    smartContractAccount.updateUserOperation.mockResolvedValue(
      UPDATE_USER_OPERATION_RESPONSE_MOCK,
    );
    smartContractAccount.signUserOperation.mockResolvedValue(
      SIGN_USER_OPERATION_RESPONSE_MOCK,
    );

    bundlerMock.sendUserOperation.mockResolvedValue(HASH_MOCK);

    networkControllerGetClientByIdMock.mockReturnValue({
      configuration: {
        chainId: CHAIN_ID_MOCK,
      },
    });

    approvalControllerAddRequestMock.mockResolvedValue({
      resultCallbacks: {
        success: resultCallbackSuccessMock,
        error: resultCallbackErrorMock,
      },
    });

    messenger.call.mockImplementation(
      (action: string, ..._args: any[]): any => {
        if (action === 'NetworkController:getNetworkClientById') {
          return networkControllerGetClientByIdMock();
        }

        if (action === 'ApprovalController:addRequest') {
          return approvalControllerAddRequestMock();
        }

        return undefined;
      },
    );

    determineTransactionTypeMock.mockResolvedValue({
      type: TransactionType.simpleSend,
    });
  });

  describe('constructor', () => {
    it('creates PendingUserOperationTracker using state user operations', () => {
      const controller = new UserOperationController({
        messenger,
      });

      const userOperationsMock = {
        testId1: { ...USER_OPERATION_METADATA_MOCK, id: 'testId1' },
        testId2: { ...USER_OPERATION_METADATA_MOCK, id: 'testId2' },
      };

      controller.state.userOperations = userOperationsMock;

      const result = jest
        .mocked(PendingUserOperationTrackerHelper.PendingUserOperationTracker)
        .mock.calls[0][0].getUserOperations();

      expect(result).toStrictEqual(Object.values(userOperationsMock));
    });

    it('sets polling interval', () => {
      new UserOperationController({
        interval: INTERVAL_MOCK,
        messenger,
      });

      expect(
        pendingUserOperationTrackerMock.setIntervalLength,
      ).toHaveBeenCalledTimes(1);
      expect(
        pendingUserOperationTrackerMock.setIntervalLength,
      ).toHaveBeenCalledWith(INTERVAL_MOCK);
    });

    it('sets polling interval to default if not specified', () => {
      new UserOperationController({
        messenger,
      });

      expect(
        pendingUserOperationTrackerMock.setIntervalLength,
      ).toHaveBeenCalledTimes(1);
      expect(
        pendingUserOperationTrackerMock.setIntervalLength,
      ).toHaveBeenCalledWith(expect.any(Number));
    });
  });

  describe.each(['addUserOperation', 'addUserOperationFromTransaction'])(
    '%s',
    (method) => {
      /**
       * Add a user operation using the specified method.
       *
       * @param controller - The controller instance.
       * @param request - The request argument.
       * @param options - The options argument.
       * @returns The user operation hash.
       */
      function addUserOperation(
        controller: UserOperationController,
        request:
          | TransactionParams
          | Parameters<UserOperationController['addUserOperation']>[0],
        options: AddUserOperationOptions,
      ) {
        return (controller as any)[method](request, options);
      }

      it('submits user operation to bundler', async () => {
        const controller = new UserOperationController({
          messenger,
        });

        const { hash } = await addUserOperation(
          controller,
          ADD_USER_OPERATION_REQUEST_MOCK,
          { ...ADD_USER_OPERATION_OPTIONS_MOCK, smartContractAccount },
        );

        const userOperationHash = await hash();

        expect(userOperationHash).toBe(HASH_MOCK);
        expect(bundlerMock.sendUserOperation).toHaveBeenCalledTimes(1);
        expect(bundlerMock.sendUserOperation).toHaveBeenCalledWith(
          {
            callData: PREPARE_USER_OPERATION_RESPONSE_MOCK.callData,
            callGasLimit:
              PREPARE_USER_OPERATION_RESPONSE_MOCK.gas?.callGasLimit,
            initCode: PREPARE_USER_OPERATION_RESPONSE_MOCK.initCode,
            maxFeePerGas: ADD_USER_OPERATION_REQUEST_MOCK.maxFeePerGas,
            maxPriorityFeePerGas:
              ADD_USER_OPERATION_REQUEST_MOCK.maxPriorityFeePerGas,
            nonce: PREPARE_USER_OPERATION_RESPONSE_MOCK.nonce,
            paymasterAndData:
              UPDATE_USER_OPERATION_RESPONSE_MOCK.paymasterAndData,
            preVerificationGas:
              PREPARE_USER_OPERATION_RESPONSE_MOCK.gas?.preVerificationGas,
            sender: PREPARE_USER_OPERATION_RESPONSE_MOCK.sender,
            signature: SIGN_USER_OPERATION_RESPONSE_MOCK.signature,
            verificationGasLimit:
              PREPARE_USER_OPERATION_RESPONSE_MOCK.gas?.verificationGasLimit,
          },
          ENTRYPOINT,
        );
      });

      it('creates metadata entry in state', async () => {
        const controller = new UserOperationController({
          messenger,
        });

        const { id } = await addUserOperation(
          controller,
          ADD_USER_OPERATION_REQUEST_MOCK,
          { ...ADD_USER_OPERATION_OPTIONS_MOCK, smartContractAccount },
        );

        expect(Object.keys(controller.state.userOperations)).toHaveLength(1);
        expect(controller.state.userOperations[id]).toStrictEqual(
          expect.objectContaining({
            actualGasCost: null,
            actualGasUsed: null,
            baseFeePerGas: null,
            bundlerUrl: null,
            chainId: CHAIN_ID_MOCK,
            error: null,
            hash: null,
            id,
            origin: ORIGIN_MOCK,
            status: UserOperationStatus.Unapproved,
            time: expect.any(Number),
            transactionHash: null,
            userOperation: expect.objectContaining({
              callData: EMPTY_BYTES,
              callGasLimit: EMPTY_BYTES,
              initCode: EMPTY_BYTES,
              nonce: EMPTY_BYTES,
              paymasterAndData: EMPTY_BYTES,
              preVerificationGas: EMPTY_BYTES,
              sender: ADDRESS_ZERO,
              signature: EMPTY_BYTES,
              verificationGasLimit: EMPTY_BYTES,
            }),
          }),
        );
      });

      it('updates metadata in state', async () => {
        const controller = new UserOperationController({
          messenger,
        });

        const { id, hash } = await addUserOperation(
          controller,
          ADD_USER_OPERATION_REQUEST_MOCK,
          { ...ADD_USER_OPERATION_OPTIONS_MOCK, smartContractAccount },
        );

        await hash();

        expect(Object.keys(controller.state.userOperations)).toHaveLength(1);
        expect(controller.state.userOperations[id]).toStrictEqual(
          expect.objectContaining({
            actualGasCost: null,
            actualGasUsed: null,
            baseFeePerGas: null,
            bundlerUrl: PREPARE_USER_OPERATION_RESPONSE_MOCK.bundler,
            chainId: CHAIN_ID_MOCK,
            error: null,
            hash: HASH_MOCK,
            id,
            origin: ORIGIN_MOCK,
            status: UserOperationStatus.Submitted,
            time: expect.any(Number),
            transactionHash: null,
            userOperation: {
              callData: PREPARE_USER_OPERATION_RESPONSE_MOCK.callData,
              callGasLimit:
                PREPARE_USER_OPERATION_RESPONSE_MOCK.gas?.callGasLimit,
              initCode: PREPARE_USER_OPERATION_RESPONSE_MOCK.initCode,
              maxFeePerGas: ADD_USER_OPERATION_REQUEST_MOCK.maxFeePerGas,
              maxPriorityFeePerGas:
                ADD_USER_OPERATION_REQUEST_MOCK.maxPriorityFeePerGas,
              nonce: PREPARE_USER_OPERATION_RESPONSE_MOCK.nonce,
              paymasterAndData:
                UPDATE_USER_OPERATION_RESPONSE_MOCK.paymasterAndData,
              preVerificationGas:
                PREPARE_USER_OPERATION_RESPONSE_MOCK.gas?.preVerificationGas,
              sender: PREPARE_USER_OPERATION_RESPONSE_MOCK.sender,
              signature: SIGN_USER_OPERATION_RESPONSE_MOCK.signature,
              verificationGasLimit:
                PREPARE_USER_OPERATION_RESPONSE_MOCK.gas?.verificationGasLimit,
            },
          }),
        );
      });

      it('defaults optional properties if not specified by account', async () => {
        const controller = new UserOperationController({
          messenger,
        });

        smartContractAccount.prepareUserOperation.mockResolvedValue({
          ...PREPARE_USER_OPERATION_RESPONSE_MOCK,
          dummyPaymasterAndData: undefined,
          dummySignature: undefined,
          initCode: undefined,
        });

        smartContractAccount.updateUserOperation.mockResolvedValue({
          ...PREPARE_USER_OPERATION_RESPONSE_MOCK,
          paymasterAndData: undefined,
        });

        const { hash } = await addUserOperation(
          controller,
          ADD_USER_OPERATION_REQUEST_MOCK,
          { ...ADD_USER_OPERATION_OPTIONS_MOCK, smartContractAccount },
        );

        const userOperationHash = await hash();

        expect(userOperationHash).toBe(HASH_MOCK);
        expect(bundlerMock.sendUserOperation).toHaveBeenCalledTimes(1);
        expect(bundlerMock.sendUserOperation).toHaveBeenCalledWith(
          expect.objectContaining({
            initCode: EMPTY_BYTES,
            paymasterAndData: EMPTY_BYTES,
          }),
          ENTRYPOINT,
        );
      });

      it('estimates gas using bundler if gas not specified by account', async () => {
        const controller = new UserOperationController({
          messenger,
        });

        bundlerMock.estimateUserOperationGas.mockResolvedValue({
          callGasLimit: 123,
          preVerificationGas: 456,
          verificationGasLimit: 789,
          verificationGas: 789,
        });

        smartContractAccount.prepareUserOperation.mockResolvedValue({
          ...PREPARE_USER_OPERATION_RESPONSE_MOCK,
          gas: undefined,
        });

        const { hash } = await addUserOperation(
          controller,
          ADD_USER_OPERATION_REQUEST_MOCK,
          { ...ADD_USER_OPERATION_OPTIONS_MOCK, smartContractAccount },
        );

        await hash();

        expect(bundlerMock.estimateUserOperationGas).toHaveBeenCalledTimes(1);
        expect(bundlerMock.estimateUserOperationGas).toHaveBeenCalledWith(
          {
            callData: PREPARE_USER_OPERATION_RESPONSE_MOCK.callData,
            callGasLimit: '0x1',
            initCode: PREPARE_USER_OPERATION_RESPONSE_MOCK.initCode,
            maxFeePerGas: ADD_USER_OPERATION_REQUEST_MOCK.maxFeePerGas,
            maxPriorityFeePerGas:
              ADD_USER_OPERATION_REQUEST_MOCK.maxPriorityFeePerGas,
            nonce: PREPARE_USER_OPERATION_RESPONSE_MOCK.nonce,
            paymasterAndData:
              PREPARE_USER_OPERATION_RESPONSE_MOCK.dummyPaymasterAndData,
            preVerificationGas: '0x1',
            sender: PREPARE_USER_OPERATION_RESPONSE_MOCK.sender,
            signature: PREPARE_USER_OPERATION_RESPONSE_MOCK.dummySignature,
            verificationGasLimit: '0x1',
          },
          ENTRYPOINT,
        );

        expect(bundlerMock.sendUserOperation).toHaveBeenCalledTimes(1);
        expect(bundlerMock.sendUserOperation).toHaveBeenCalledWith(
          expect.objectContaining({
            callGasLimit: '0xb9',
            preVerificationGas: '0x2ac',
            verificationGasLimit: '0x4a0',
          }),
          ENTRYPOINT,
        );
      });

      it('marks user operation as failed if error', async () => {
        const controller = new UserOperationController({
          messenger,
        });

        const error = new Error(ERROR_MESSAGE_MOCK);
        (error as any).code = ERROR_CODE_MOCK;

        bundlerMock.sendUserOperation.mockRejectedValue(error);

        const { id, hash } = await addUserOperation(
          controller,
          ADD_USER_OPERATION_REQUEST_MOCK,
          { ...ADD_USER_OPERATION_OPTIONS_MOCK, smartContractAccount },
        );

        await expect(hash()).rejects.toThrow(ERROR_MESSAGE_MOCK);

        expect(Object.keys(controller.state.userOperations)).toHaveLength(1);
        expect(controller.state.userOperations[id]).toStrictEqual(
          expect.objectContaining({
            error: {
              code: ERROR_CODE_MOCK,
              message: ERROR_MESSAGE_MOCK,
              name: error.name,
              rpc: undefined,
              stack: error.stack,
            },
            id,
            status: UserOperationStatus.Failed,
          }),
        );
      });

      // eslint-disable-next-line jest/expect-expect
      it('does not throw if hash function not invoked', async () => {
        const controller = new UserOperationController({
          messenger,
        });

        bundlerMock.sendUserOperation.mockRejectedValue(
          new Error(ERROR_MESSAGE_MOCK),
        );

        await addUserOperation(controller, ADD_USER_OPERATION_REQUEST_MOCK, {
          ...ADD_USER_OPERATION_OPTIONS_MOCK,
          smartContractAccount,
        });

        await flushPromises();
      });

      it('validates responses from account', async () => {
        const controller = new UserOperationController({
          messenger,
        });

        const { hash } = await addUserOperation(
          controller,
          ADD_USER_OPERATION_REQUEST_MOCK,
          {
            ...ADD_USER_OPERATION_OPTIONS_MOCK,
            smartContractAccount,
          },
        );

        await hash();

        expect(validatePrepareUserOperationResponseMock).toHaveBeenCalledTimes(
          1,
        );
        expect(validatePrepareUserOperationResponseMock).toHaveBeenCalledWith(
          PREPARE_USER_OPERATION_RESPONSE_MOCK,
        );

        expect(validateUpdateUserOperationResponseMock).toHaveBeenCalledTimes(
          1,
        );
        expect(validateUpdateUserOperationResponseMock).toHaveBeenCalledWith(
          UPDATE_USER_OPERATION_RESPONSE_MOCK,
        );

        expect(validateSignUserOperationResponseMock).toHaveBeenCalledTimes(1);
        expect(validateSignUserOperationResponseMock).toHaveBeenCalledWith(
          SIGN_USER_OPERATION_RESPONSE_MOCK,
        );
      });

      it('optionally waits for confirmation', async () => {
        const controller = new UserOperationController({
          messenger,
        });

        const { transactionHash } = await addUserOperation(
          controller,
          ADD_USER_OPERATION_REQUEST_MOCK,
          { ...ADD_USER_OPERATION_OPTIONS_MOCK, smartContractAccount },
        );

        const getTransactionHash = transactionHash();

        await flushPromises();

        const metadata = Object.values(controller.state.userOperations)[0];

        pendingUserOperationTrackerMock.hub.emit('user-operation-confirmed', {
          ...metadata,
          transactionHash: TRANSACTION_HASH_MOCK,
        });

        const transctionHash = await getTransactionHash;

        expect(transctionHash).toBe(TRANSACTION_HASH_MOCK);
      });

      it('throws if submission failure while waiting for confirmation', async () => {
        const controller = new UserOperationController({
          messenger,
        });

        const { transactionHash } = await addUserOperation(
          controller,
          ADD_USER_OPERATION_REQUEST_MOCK,
          { ...ADD_USER_OPERATION_OPTIONS_MOCK, smartContractAccount },
        );

        bundlerMock.sendUserOperation.mockRejectedValue(
          new Error(ERROR_MESSAGE_MOCK),
        );

        await expect(transactionHash()).rejects.toThrow(ERROR_MESSAGE_MOCK);
      });

      it('throws if confirmation failure while waiting for confirmation', async () => {
        const controller = new UserOperationController({
          messenger,
        });

        const { transactionHash } = await addUserOperation(
          controller,
          ADD_USER_OPERATION_REQUEST_MOCK,
          { ...ADD_USER_OPERATION_OPTIONS_MOCK, smartContractAccount },
        );

        const getTransactionHash = transactionHash();

        await flushPromises();

        const metadata = Object.values(controller.state.userOperations)[0];

        pendingUserOperationTrackerMock.hub.emit(
          'user-operation-failed',
          metadata,
          new Error(ERROR_MESSAGE_MOCK),
        );

        await expect(getTransactionHash).rejects.toThrow(ERROR_MESSAGE_MOCK);
      });

      it('requests approval if not explicitly disabled', async () => {
        const controller = new UserOperationController({
          messenger,
        });

        const { hash, id } = await addUserOperation(
          controller,
          ADD_USER_OPERATION_REQUEST_MOCK,
          { ...ADD_USER_OPERATION_OPTIONS_MOCK, smartContractAccount },
        );

        await hash();

        expect(messenger.call).toHaveBeenCalledTimes(2);
        expect(messenger.call).toHaveBeenCalledWith(
          'ApprovalController:addRequest',
          {
            id,
            type: ApprovalType.Transaction,
            origin: ORIGIN_MOCK,
            expectsResult: true,
            requestData: {
              txId: id,
            },
          },
          true,
        );
      });

      it('does not request approval if disabled', async () => {
        const controller = new UserOperationController({
          messenger,
        });

        const { hash } = await addUserOperation(
          controller,
          ADD_USER_OPERATION_REQUEST_MOCK,
          {
            ...ADD_USER_OPERATION_OPTIONS_MOCK,
            smartContractAccount,
            requireApproval: false,
          },
        );

        await hash();

        expect(messenger.call).toHaveBeenCalledTimes(1);
      });

      it('updates gas fees if approval request resolved with updated transaction', async () => {
        const controller = new UserOperationController({
          messenger,
        });

        approvalControllerAddRequestMock.mockResolvedValue({
          value: {
            txMeta: {
              txParams: {
                maxFeePerGas: '0x6',
                maxPriorityFeePerGas: '0x7',
              },
            },
          },
        });

        smartContractAccount.updateUserOperation.mockResolvedValue({
          paymasterAndData: EMPTY_BYTES,
        });

        const { hash, id } = await addUserOperation(
          controller,
          ADD_USER_OPERATION_REQUEST_MOCK,
          {
            ...ADD_USER_OPERATION_OPTIONS_MOCK,
            smartContractAccount,
          },
        );

        await hash();

        expect(controller.state.userOperations[id].userOperation).toStrictEqual(
          expect.objectContaining({
            maxFeePerGas: '0x6',
            maxPriorityFeePerGas: '0x7',
          }),
        );
      });

      it('does not update gas fees after approval if paymaster data set', async () => {
        const controller = new UserOperationController({
          messenger,
        });

        approvalControllerAddRequestMock.mockResolvedValue({
          value: {
            txMeta: {
              txParams: {
                maxFeePerGas: '0x6',
                maxPriorityFeePerGas: '0x7',
              },
            },
          },
        });

        const { hash, id } = await addUserOperation(
          controller,
          ADD_USER_OPERATION_REQUEST_MOCK,
          {
            ...ADD_USER_OPERATION_OPTIONS_MOCK,
            smartContractAccount,
          },
        );

        await hash();

        expect(controller.state.userOperations[id].userOperation).toStrictEqual(
          expect.objectContaining({
            maxFeePerGas: ADD_USER_OPERATION_REQUEST_MOCK.maxFeePerGas,
            maxPriorityFeePerGas:
              ADD_USER_OPERATION_REQUEST_MOCK.maxPriorityFeePerGas,
          }),
        );
      });

      it('invokes result callbacks if submit successful', async () => {
        const controller = new UserOperationController({
          messenger,
        });

        const { hash } = await addUserOperation(
          controller,
          ADD_USER_OPERATION_REQUEST_MOCK,
          {
            ...ADD_USER_OPERATION_OPTIONS_MOCK,
            smartContractAccount,
          },
        );

        await hash();

        expect(resultCallbackSuccessMock).toHaveBeenCalledTimes(1);
        expect(resultCallbackErrorMock).not.toHaveBeenCalled();
      });

      it('invokes result callbacks if error while submitting', async () => {
        const controller = new UserOperationController({
          messenger,
        });

        const errorMock = new Error(ERROR_MESSAGE_MOCK);

        bundlerMock.sendUserOperation.mockRejectedValue(errorMock);

        await addUserOperation(controller, ADD_USER_OPERATION_REQUEST_MOCK, {
          ...ADD_USER_OPERATION_OPTIONS_MOCK,
          smartContractAccount,
        });

        await flushPromises();

        expect(resultCallbackErrorMock).toHaveBeenCalledTimes(1);
        expect(resultCallbackErrorMock).toHaveBeenCalledWith(errorMock);
        expect(resultCallbackSuccessMock).not.toHaveBeenCalled();
      });

      if (method === 'addUserOperation') {
        it('validates arguments', async () => {
          const controller = new UserOperationController({
            messenger,
          });

          await addUserOperation(controller, ADD_USER_OPERATION_REQUEST_MOCK, {
            ...ADD_USER_OPERATION_OPTIONS_MOCK,
            smartContractAccount,
          });

          expect(validateAddUserOperationRequestMock).toHaveBeenCalledTimes(1);
          expect(validateAddUserOperationRequestMock).toHaveBeenCalledWith(
            ADD_USER_OPERATION_REQUEST_MOCK,
          );

          expect(validateAddUserOperationOptionsMock).toHaveBeenCalledTimes(1);
          expect(validateAddUserOperationOptionsMock).toHaveBeenCalledWith({
            ...ADD_USER_OPERATION_OPTIONS_MOCK,
            smartContractAccount,
          });
        });
      }

      if (method === 'addUserOperationFromTransaction') {
        it('sets data as undefined if empty string', async () => {
          const controller = new UserOperationController({
            messenger,
          });

          await addUserOperation(
            controller,
            { ...ADD_USER_OPERATION_REQUEST_MOCK, data: '' },
            {
              ...ADD_USER_OPERATION_OPTIONS_MOCK,
              smartContractAccount,
            },
          );

          expect(
            smartContractAccount.prepareUserOperation,
          ).toHaveBeenCalledTimes(1);
          expect(
            smartContractAccount.prepareUserOperation,
          ).toHaveBeenCalledWith(
            expect.objectContaining({
              data: undefined,
            }),
          );
        });

        it('sets transaction type in metadata', async () => {
          const controller = new UserOperationController({
            messenger,
          });

          const { id } = await addUserOperation(
            controller,
            ADD_USER_OPERATION_REQUEST_MOCK,
            {
              ...ADD_USER_OPERATION_OPTIONS_MOCK,
              smartContractAccount,
            },
          );

          expect(controller.state.userOperations[id].transactionType).toBe(
            TransactionType.simpleSend,
          );

          expect(determineTransactionTypeMock).toHaveBeenCalledTimes(1);
          expect(determineTransactionTypeMock).toHaveBeenCalledWith(
            ADD_USER_OPERATION_REQUEST_MOCK,
            expect.anything(),
          );
        });
      }
    },
  );

  describe('startPollingByNetworkClientId', () => {
    it('starts polling in PendingUserOperationTracker', async () => {
      const controller = new UserOperationController({
        messenger,
      });

      controller.startPollingByNetworkClientId(NETWORK_CLIENT_ID_MOCK);

      expect(
        pendingUserOperationTrackerMock.startPollingByNetworkClientId,
      ).toHaveBeenCalledTimes(1);
      expect(
        pendingUserOperationTrackerMock.startPollingByNetworkClientId,
      ).toHaveBeenCalledWith(NETWORK_CLIENT_ID_MOCK);
    });
  });

  describe('on PendingUserOperationTracker events', () => {
    describe('on user operation confirmed', () => {
      it('bubbles event', async () => {
        const listener = jest.fn();

        const controller = new UserOperationController({
          messenger,
        });

        controller.hub.on('user-operation-confirmed', listener);

        pendingUserOperationTrackerMock.hub.emit(
          'user-operation-confirmed',
          USER_OPERATION_METADATA_MOCK,
        );

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(USER_OPERATION_METADATA_MOCK);
      });

      it('emits id confirmed event', async () => {
        const listener = jest.fn();

        const controller = new UserOperationController({
          messenger,
        });

        controller.hub.on(
          `${USER_OPERATION_METADATA_MOCK.id}:confirmed`,
          listener,
        );

        pendingUserOperationTrackerMock.hub.emit(
          'user-operation-confirmed',
          USER_OPERATION_METADATA_MOCK,
        );

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(USER_OPERATION_METADATA_MOCK);
      });
    });

    describe('on user operation failed', () => {
      it('bubbles event', async () => {
        const listener = jest.fn();
        const errorMock = new Error(ERROR_MESSAGE_MOCK);

        const controller = new UserOperationController({
          messenger,
        });

        controller.hub.on('user-operation-failed', listener);

        pendingUserOperationTrackerMock.hub.emit(
          'user-operation-failed',
          USER_OPERATION_METADATA_MOCK,
          errorMock,
        );

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(
          USER_OPERATION_METADATA_MOCK,
          errorMock,
        );
      });

      it('emits id failed event', async () => {
        const listener = jest.fn();
        const errorMock = new Error(ERROR_MESSAGE_MOCK);

        const controller = new UserOperationController({
          messenger,
        });

        controller.hub.on(
          `${USER_OPERATION_METADATA_MOCK.id}:failed`,
          listener,
        );

        pendingUserOperationTrackerMock.hub.emit(
          'user-operation-failed',
          USER_OPERATION_METADATA_MOCK,
          errorMock,
        );

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(
          USER_OPERATION_METADATA_MOCK,
          errorMock,
        );
      });
    });

    describe('on user operation updated', () => {
      it('updates state', async () => {
        const controller = new UserOperationController({
          messenger,
        });

        controller.state.userOperations = {
          [USER_OPERATION_METADATA_MOCK.id]: {
            ...USER_OPERATION_METADATA_MOCK,
          },
          testId2: {
            ...USER_OPERATION_METADATA_MOCK,
            id: 'testId2',
          },
        };

        pendingUserOperationTrackerMock.hub.emit('user-operation-updated', {
          ...USER_OPERATION_METADATA_MOCK,
          status: UserOperationStatus.Failed,
        });

        expect(controller.state.userOperations).toStrictEqual({
          [USER_OPERATION_METADATA_MOCK.id]: {
            ...USER_OPERATION_METADATA_MOCK,
            status: UserOperationStatus.Failed,
          },
          testId2: {
            ...USER_OPERATION_METADATA_MOCK,
            id: 'testId2',
          },
        });
      });
    });
  });
});
