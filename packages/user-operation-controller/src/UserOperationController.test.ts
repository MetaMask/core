import { ApprovalType } from '@metamask/controller-utils';
import { errorCodes } from '@metamask/rpc-errors';
import {
  determineTransactionType,
  TransactionType,
  type TransactionParams,
} from '@metamask/transaction-controller';
import { EventEmitter } from 'stream';

import { ADDRESS_ZERO, EMPTY_BYTES, VALUE_ZERO } from './constants';
import * as BundlerHelper from './helpers/Bundler';
import * as PendingUserOperationTrackerHelper from './helpers/PendingUserOperationTracker';
import { SnapSmartContractAccount } from './helpers/SnapSmartContractAccount';
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
  AddUserOperationRequest,
  UserOperationControllerMessenger,
} from './UserOperationController';
import { UserOperationController } from './UserOperationController';
import { updateGas } from './utils/gas';
import { updateGasFees } from './utils/gas-fees';
import {
  validateAddUserOperationRequest,
  validateAddUserOperationOptions,
  validatePrepareUserOperationResponse,
  validateSignUserOperationResponse,
  validateUpdateUserOperationResponse,
} from './utils/validation';

jest.mock('@metamask/transaction-controller');
jest.mock('./utils/gas');
jest.mock('./utils/gas-fees');
jest.mock('./utils/validation');
jest.mock('./helpers/Bundler');
jest.mock('./helpers/PendingUserOperationTracker');
jest.mock('./helpers/SnapSmartContractAccount');

const CHAIN_ID_MOCK = '0x5';
const USER_OPERATION_HASH_MOCK = '0x123';
const ERROR_MESSAGE_MOCK = 'Test Error';
const ERROR_CODE_MOCK = '1234';
const NETWORK_CLIENT_ID_MOCK = 'testNetworkClientId';
const TRANSACTION_HASH_MOCK = '0x456';
const ORIGIN_MOCK = 'test.com';
const ENTRYPOINT_MOCK = '0x789';

const USER_OPERATION_METADATA_MOCK = {
  chainId: CHAIN_ID_MOCK,
  id: 'testUserOperationId',
  status: UserOperationStatus.Confirmed,
} as UserOperationMetadata;

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

const ADD_USER_OPERATION_REQUEST_MOCK: AddUserOperationRequest = {
  data: '0x1',
  from: '0x12',
  to: '0x2',
  value: '0x3',
  maxFeePerGas: '0x4',
  maxPriorityFeePerGas: '0x5',
};

const ADD_USER_OPERATION_OPTIONS_MOCK: AddUserOperationOptions = {
  networkClientId: NETWORK_CLIENT_ID_MOCK,
  origin: ORIGIN_MOCK,
};

/**
 * Creates a mock user operation messenger.
 * @returns The mock user operation messenger.
 */
function createMessengerMock() {
  return {
    call: jest.fn(),
    publish: jest.fn(),
    registerActionHandler: jest.fn(),
    registerInitialEventPayload: jest.fn(),
  } as unknown as jest.Mocked<UserOperationControllerMessenger>;
}

/**
 * Creates a mock smart contract account.
 * @returns The mock smart contract account.
 */
function createSmartContractAccountMock() {
  return {
    prepareUserOperation: jest.fn(),
    updateUserOperation: jest.fn(),
    signUserOperation: jest.fn(),
  } as jest.Mocked<SmartContractAccount>;
}

/**
 * Creates a mock bundler.
 * @returns The mock bundler.
 */
function createBundlerMock() {
  return {
    estimateUserOperationGas: jest.fn(),
    sendUserOperation: jest.fn(),
  } as unknown as jest.Mocked<BundlerHelper.Bundler>;
}

/**
 * Creates a mock PendingUserOperationTracker.
 * @returns The mock PendingUserOperationTracker.
 */
function createPendingUserOperationTrackerMock() {
  return {
    startPollingByNetworkClientId: jest.fn(),
    setIntervalLength: jest.fn(),
    hub: new EventEmitter(),
  } as unknown as jest.Mocked<PendingUserOperationTrackerHelper.PendingUserOperationTracker>;
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
  const getGasFeeEstimates = jest.fn();
  const updateGasMock = jest.mocked(updateGas);
  const updateGasFeesMock = jest.mocked(updateGasFees);

  const optionsMock = {
    entrypoint: ENTRYPOINT_MOCK,
    getGasFeeEstimates,
    messenger,
  };

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

    bundlerMock.sendUserOperation.mockResolvedValue(USER_OPERATION_HASH_MOCK);

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
      (
        ...args: Parameters<UserOperationControllerMessenger['call']>
      ): ReturnType<UserOperationControllerMessenger['call']> => {
        const action = args[0];

        if (action === 'NetworkController:getNetworkClientById') {
          return networkControllerGetClientByIdMock();
        }

        if (action === 'ApprovalController:addRequest') {
          return approvalControllerAddRequestMock();
        }

        throw new Error(`Unexpected mock messenger action: ${action}`);
      },
    );

    determineTransactionTypeMock.mockResolvedValue({
      type: TransactionType.simpleSend,
    });

    updateGasMock.mockImplementation(async (metadata) => {
      metadata.userOperation.callGasLimit = PREPARE_USER_OPERATION_RESPONSE_MOCK
        .gas?.callGasLimit as string;

      metadata.userOperation.preVerificationGas =
        PREPARE_USER_OPERATION_RESPONSE_MOCK.gas?.preVerificationGas as string;

      metadata.userOperation.verificationGasLimit =
        PREPARE_USER_OPERATION_RESPONSE_MOCK.gas
          ?.verificationGasLimit as string;
    });

    updateGasFeesMock
      .mockImplementationOnce(async ({ metadata }) => {
        metadata.userOperation.maxFeePerGas =
          ADD_USER_OPERATION_REQUEST_MOCK.maxFeePerGas as string;

        metadata.userOperation.maxPriorityFeePerGas =
          ADD_USER_OPERATION_REQUEST_MOCK.maxPriorityFeePerGas as string;
      })
      .mockImplementationOnce(async ({ metadata }) => {
        metadata.userOperation.maxFeePerGas = '0x6';
        metadata.userOperation.maxPriorityFeePerGas = '0x7';
      });
  });

  describe('constructor', () => {
    it('creates PendingUserOperationTracker using state user operations', () => {
      const userOperationsMock = {
        testId1: { ...USER_OPERATION_METADATA_MOCK, id: 'testId1' },
        testId2: { ...USER_OPERATION_METADATA_MOCK, id: 'testId2' },
      };
      new UserOperationController({
        ...optionsMock,
        state: {
          userOperations: userOperationsMock,
        },
      });

      const result = jest
        .mocked(PendingUserOperationTrackerHelper.PendingUserOperationTracker)
        .mock.calls[0][0].getUserOperations();

      expect(result).toStrictEqual(Object.values(userOperationsMock));
    });
  });

  describe.each([
    'addUserOperation',
    'addUserOperationFromTransaction',
  ] as const)('%s', (method) => {
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
      request: AddUserOperationRequest | TransactionParams,
      options: AddUserOperationOptions,
    ) {
      return controller[method](request as TransactionParams, options);
    }

    it('submits user operation to bundler', async () => {
      const controller = new UserOperationController(optionsMock);

      const { hash } = await addUserOperation(
        controller,
        ADD_USER_OPERATION_REQUEST_MOCK,
        { ...ADD_USER_OPERATION_OPTIONS_MOCK, smartContractAccount },
      );

      const userOperationHash = await hash();

      expect(userOperationHash).toBe(USER_OPERATION_HASH_MOCK);
      expect(bundlerMock.sendUserOperation).toHaveBeenCalledTimes(1);
      expect(bundlerMock.sendUserOperation).toHaveBeenCalledWith(
        {
          callData: PREPARE_USER_OPERATION_RESPONSE_MOCK.callData,
          callGasLimit: PREPARE_USER_OPERATION_RESPONSE_MOCK.gas?.callGasLimit,
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
        ENTRYPOINT_MOCK,
      );
    });

    it('emits added event', async () => {
      const controller = new UserOperationController(optionsMock);

      const listener = jest.fn();
      controller.hub.on('user-operation-added', listener);

      const { id, hash } = await addUserOperation(
        controller,
        ADD_USER_OPERATION_REQUEST_MOCK,
        { ...ADD_USER_OPERATION_OPTIONS_MOCK, smartContractAccount },
      );

      await hash();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          id,
        }),
      );
    });

    it('creates initial empty metadata entry in state', async () => {
      const controller = new UserOperationController(optionsMock);

      const { id } = await addUserOperation(
        controller,
        ADD_USER_OPERATION_REQUEST_MOCK,
        {
          ...ADD_USER_OPERATION_OPTIONS_MOCK,
          smartContractAccount,
        },
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
          swapsMetadata: null,
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

    it('includes swap metadata in metadata', async () => {
      const controller = new UserOperationController(optionsMock);

      const { id } = await addUserOperation(
        controller,
        ADD_USER_OPERATION_REQUEST_MOCK,
        {
          ...ADD_USER_OPERATION_OPTIONS_MOCK,
          smartContractAccount,
          swaps: {
            approvalTxId: 'testTxId',
            destinationTokenAmount: '0x1',
            destinationTokenAddress: '0x1',
            destinationTokenDecimals: 3,
            destinationTokenSymbol: 'TEST',
            estimatedBaseFee: '0x2',
            sourceTokenAddress: '0x3',
            sourceTokenAmount: '0x4',
            sourceTokenDecimals: 5,
            swapAndSendRecipient: '0x5',
            sourceTokenSymbol: 'ETH',
            swapMetaData: { test: 'value' },
            swapTokenValue: '0x3',
          },
        },
      );

      expect(Object.keys(controller.state.userOperations)).toHaveLength(1);
      expect(controller.state.userOperations[id]).toStrictEqual(
        expect.objectContaining({
          swapsMetadata: {
            approvalTxId: 'testTxId',
            destinationTokenAmount: '0x1',
            destinationTokenAddress: '0x1',
            destinationTokenDecimals: 3,
            destinationTokenSymbol: 'TEST',
            estimatedBaseFee: '0x2',
            sourceTokenAddress: '0x3',
            sourceTokenAmount: '0x4',
            sourceTokenDecimals: 5,
            swapAndSendRecipient: '0x5',
            sourceTokenSymbol: 'ETH',
            swapMetaData: { test: 'value' },
            swapTokenValue: '0x3',
          },
        }),
      );
    });

    it('defaults missing swap metadata to null', async () => {
      const controller = new UserOperationController(optionsMock);

      const { id } = await addUserOperation(
        controller,
        ADD_USER_OPERATION_REQUEST_MOCK,
        {
          ...ADD_USER_OPERATION_OPTIONS_MOCK,
          smartContractAccount,
          swaps: {},
        },
      );

      expect(Object.keys(controller.state.userOperations)).toHaveLength(1);
      expect(controller.state.userOperations[id]).toStrictEqual(
        expect.objectContaining({
          swapsMetadata: {
            approvalTxId: null,
            destinationTokenAddress: null,
            destinationTokenAmount: null,
            destinationTokenDecimals: null,
            destinationTokenSymbol: null,
            estimatedBaseFee: null,
            sourceTokenAddress: null,
            sourceTokenAmount: null,
            sourceTokenDecimals: null,
            sourceTokenSymbol: null,
            swapAndSendRecipient: null,
            swapMetaData: null,
            swapTokenValue: null,
          },
        }),
      );
    });

    it('updates metadata in state after submission', async () => {
      const controller = new UserOperationController(optionsMock);

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
          hash: USER_OPERATION_HASH_MOCK,
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
      const controller = new UserOperationController(optionsMock);

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

      expect(userOperationHash).toBe(USER_OPERATION_HASH_MOCK);
      expect(bundlerMock.sendUserOperation).toHaveBeenCalledTimes(1);
      expect(bundlerMock.sendUserOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          initCode: EMPTY_BYTES,
          paymasterAndData: EMPTY_BYTES,
        }),
        ENTRYPOINT_MOCK,
      );
    });

    it('marks user operation as failed if error', async () => {
      const controller = new UserOperationController(optionsMock);

      const error = new Error(ERROR_MESSAGE_MOCK);
      (error as unknown as Record<string, unknown>).code = ERROR_CODE_MOCK;

      bundlerMock.sendUserOperation.mockRejectedValue(error);

      const { id, hash } = await controller.addUserOperation(
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

    it('deletes user operation if rejected', async () => {
      const controller = new UserOperationController(optionsMock);

      const error = new Error(ERROR_MESSAGE_MOCK);
      (error as unknown as Record<string, unknown>).code =
        errorCodes.provider.userRejectedRequest;

      approvalControllerAddRequestMock.mockClear();
      approvalControllerAddRequestMock.mockRejectedValue(error);

      const { hash } = await controller.addUserOperation(
        ADD_USER_OPERATION_REQUEST_MOCK,
        { ...ADD_USER_OPERATION_OPTIONS_MOCK, smartContractAccount },
      );

      await expect(hash()).rejects.toThrow(ERROR_MESSAGE_MOCK);

      expect(Object.keys(controller.state.userOperations)).toHaveLength(0);
    });

    // eslint-disable-next-line jest/expect-expect
    it('does not throw if hash function not invoked', async () => {
      const controller = new UserOperationController(optionsMock);

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
      const controller = new UserOperationController(optionsMock);

      const { hash } = await addUserOperation(
        controller,
        ADD_USER_OPERATION_REQUEST_MOCK,
        {
          ...ADD_USER_OPERATION_OPTIONS_MOCK,
          smartContractAccount,
        },
      );

      await hash();

      expect(validatePrepareUserOperationResponseMock).toHaveBeenCalledTimes(1);
      expect(validatePrepareUserOperationResponseMock).toHaveBeenCalledWith(
        PREPARE_USER_OPERATION_RESPONSE_MOCK,
      );

      expect(validateUpdateUserOperationResponseMock).toHaveBeenCalledTimes(1);
      expect(validateUpdateUserOperationResponseMock).toHaveBeenCalledWith(
        UPDATE_USER_OPERATION_RESPONSE_MOCK,
      );

      expect(validateSignUserOperationResponseMock).toHaveBeenCalledTimes(1);
      expect(validateSignUserOperationResponseMock).toHaveBeenCalledWith(
        SIGN_USER_OPERATION_RESPONSE_MOCK,
      );
    });

    it('optionally waits for confirmation', async () => {
      const controller = new UserOperationController(optionsMock);

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
      const controller = new UserOperationController(optionsMock);

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
      const controller = new UserOperationController(optionsMock);

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
      const controller = new UserOperationController(optionsMock);

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
      const controller = new UserOperationController(optionsMock);

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

    it('invokes result callbacks if submit successful', async () => {
      const controller = new UserOperationController(optionsMock);

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
      const controller = new UserOperationController(optionsMock);

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

    it('uses snap smart contract account if no smart contract account provided', async () => {
      const prepareMock = jest.spyOn(
        SnapSmartContractAccount.prototype,
        'prepareUserOperation',
      );

      const controller = new UserOperationController(optionsMock);

      await addUserOperation(controller, ADD_USER_OPERATION_REQUEST_MOCK, {
        ...ADD_USER_OPERATION_OPTIONS_MOCK,
        smartContractAccount: undefined,
      });

      await flushPromises();

      expect(prepareMock).toHaveBeenCalledTimes(1);
    });

    it('uses gas limits suggested by smart contract account during #addPaymasterData', async () => {
      const controller = new UserOperationController(optionsMock);
      const UPDATE_USER_OPERATION_WITH_GAS_LIMITS_RESPONSE_MOCK: UpdateUserOperationResponse =
        {
          paymasterAndData: '0xA',
          callGasLimit: '0x123',
          preVerificationGas: '0x456',
          verificationGasLimit: '0x789',
        };
      smartContractAccount.updateUserOperation.mockResolvedValue(
        UPDATE_USER_OPERATION_WITH_GAS_LIMITS_RESPONSE_MOCK,
      );
      const { id, hash } = await addUserOperation(
        controller,
        ADD_USER_OPERATION_REQUEST_MOCK,
        { ...ADD_USER_OPERATION_OPTIONS_MOCK, smartContractAccount },
      );

      await hash();

      expect(Object.keys(controller.state.userOperations)).toHaveLength(1);
      expect(
        controller.state.userOperations[id].userOperation.callGasLimit,
      ).toBe(UPDATE_USER_OPERATION_WITH_GAS_LIMITS_RESPONSE_MOCK.callGasLimit);
      expect(
        controller.state.userOperations[id].userOperation.verificationGasLimit,
      ).toBe(
        UPDATE_USER_OPERATION_WITH_GAS_LIMITS_RESPONSE_MOCK.verificationGasLimit,
      );
      expect(
        controller.state.userOperations[id].userOperation.preVerificationGas,
      ).toBe(
        UPDATE_USER_OPERATION_WITH_GAS_LIMITS_RESPONSE_MOCK.preVerificationGas,
      );
    });

    describe('if approval request resolved with updated transaction', () => {
      it('updates gas fees without regeneration if paymaster data not set', async () => {
        const controller = new UserOperationController(optionsMock);

        approvalControllerAddRequestMock.mockResolvedValue({
          value: {
            txMeta: {
              txParams: {
                ...ADD_USER_OPERATION_REQUEST_MOCK,
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
        expect(smartContractAccount.prepareUserOperation).toHaveBeenCalledTimes(
          1,
        );
        expect(smartContractAccount.updateUserOperation).toHaveBeenCalledTimes(
          1,
        );
      });

      it('does not update gas fees nor regenerate if paymaster is set but updated gas fees are zero', async () => {
        const controller = new UserOperationController(optionsMock);

        approvalControllerAddRequestMock.mockResolvedValue({
          value: {
            txMeta: {
              txParams: {
                ...ADD_USER_OPERATION_REQUEST_MOCK,
                maxFeePerGas: '0x0',
                maxPriorityFeePerGas: '0x0',
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
            maxFeePerGas: '0x4',
            maxPriorityFeePerGas: '0x5',
          }),
        );
        expect(smartContractAccount.prepareUserOperation).toHaveBeenCalledTimes(
          1,
        );
        expect(smartContractAccount.updateUserOperation).toHaveBeenCalledTimes(
          1,
        );
      });

      it('regenerates if gas fees updated and paymaster data set', async () => {
        const controller = new UserOperationController(optionsMock);

        approvalControllerAddRequestMock.mockResolvedValue({
          value: {
            txMeta: {
              txParams: {
                ...ADD_USER_OPERATION_REQUEST_MOCK,
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
            maxFeePerGas: '0x6',
            maxPriorityFeePerGas: '0x7',
          }),
        );
        expect(smartContractAccount.prepareUserOperation).toHaveBeenCalledTimes(
          2,
        );
        expect(smartContractAccount.updateUserOperation).toHaveBeenCalledTimes(
          2,
        );
        expect(smartContractAccount.updateUserOperation).toHaveBeenCalledWith({
          userOperation: expect.objectContaining({
            maxFeePerGas: '0x6',
            maxPriorityFeePerGas: '0x7',
          }),
          chainId: CHAIN_ID_MOCK,
        });
      });

      it('regenerates if data updated', async () => {
        const controller = new UserOperationController(optionsMock);

        approvalControllerAddRequestMock.mockResolvedValue({
          value: {
            txMeta: {
              txParams: {
                ...ADD_USER_OPERATION_REQUEST_MOCK,
                data: '0x6',
              },
            },
          },
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

        expect(smartContractAccount.prepareUserOperation).toHaveBeenCalledTimes(
          2,
        );
        expect(smartContractAccount.prepareUserOperation).toHaveBeenCalledWith(
          expect.objectContaining({ data: '0x6' }),
        );
        expect(smartContractAccount.updateUserOperation).toHaveBeenCalledTimes(
          2,
        );
      });

      it('regenerates if value updated', async () => {
        const controller = new UserOperationController(optionsMock);

        approvalControllerAddRequestMock.mockResolvedValue({
          value: {
            txMeta: {
              txParams: {
                ...ADD_USER_OPERATION_REQUEST_MOCK,
                value: '0x6',
              },
            },
          },
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

        expect(smartContractAccount.prepareUserOperation).toHaveBeenCalledTimes(
          2,
        );
        expect(smartContractAccount.prepareUserOperation).toHaveBeenCalledWith(
          expect.objectContaining({ value: '0x6' }),
        );
        expect(smartContractAccount.updateUserOperation).toHaveBeenCalledTimes(
          2,
        );
      });

      it('does not regenerate if original data is undefined and updated data is empty', async () => {
        const controller = new UserOperationController(optionsMock);

        approvalControllerAddRequestMock.mockResolvedValue({
          value: {
            txMeta: {
              txParams: {
                ...ADD_USER_OPERATION_REQUEST_MOCK,
                data: EMPTY_BYTES,
              },
            },
          },
        });

        const { hash } = await addUserOperation(
          controller,
          { ...ADD_USER_OPERATION_REQUEST_MOCK, data: undefined },
          {
            ...ADD_USER_OPERATION_OPTIONS_MOCK,
            smartContractAccount,
          },
        );

        await hash();

        expect(smartContractAccount.prepareUserOperation).toHaveBeenCalledTimes(
          1,
        );
        expect(smartContractAccount.updateUserOperation).toHaveBeenCalledTimes(
          1,
        );
      });

      it('does not regenerate if original data is empty and updated data is undefined', async () => {
        const controller = new UserOperationController(optionsMock);

        approvalControllerAddRequestMock.mockResolvedValue({
          value: {
            txMeta: {
              txParams: {
                ...ADD_USER_OPERATION_REQUEST_MOCK,
                data: undefined,
              },
            },
          },
        });

        const { hash } = await addUserOperation(
          controller,
          { ...ADD_USER_OPERATION_REQUEST_MOCK, data: EMPTY_BYTES },
          {
            ...ADD_USER_OPERATION_OPTIONS_MOCK,
            smartContractAccount,
          },
        );

        await hash();

        expect(smartContractAccount.prepareUserOperation).toHaveBeenCalledTimes(
          1,
        );
        expect(smartContractAccount.updateUserOperation).toHaveBeenCalledTimes(
          1,
        );
      });

      it('does not regenerate if original value is undefined and updated value is zero', async () => {
        const controller = new UserOperationController(optionsMock);

        approvalControllerAddRequestMock.mockResolvedValue({
          value: {
            txMeta: {
              txParams: {
                ...ADD_USER_OPERATION_REQUEST_MOCK,
                value: VALUE_ZERO,
              },
            },
          },
        });

        const { hash } = await addUserOperation(
          controller,
          { ...ADD_USER_OPERATION_REQUEST_MOCK, value: undefined },
          {
            ...ADD_USER_OPERATION_OPTIONS_MOCK,
            smartContractAccount,
          },
        );

        await hash();

        expect(smartContractAccount.prepareUserOperation).toHaveBeenCalledTimes(
          1,
        );
        expect(smartContractAccount.updateUserOperation).toHaveBeenCalledTimes(
          1,
        );
      });

      it('does not regenerate if original value is zero and updated value is undefined', async () => {
        const controller = new UserOperationController(optionsMock);

        approvalControllerAddRequestMock.mockResolvedValue({
          value: {
            txMeta: {
              txParams: {
                ...ADD_USER_OPERATION_REQUEST_MOCK,
                value: undefined,
              },
            },
          },
        });

        const { hash } = await addUserOperation(
          controller,
          { ...ADD_USER_OPERATION_REQUEST_MOCK, value: VALUE_ZERO },
          {
            ...ADD_USER_OPERATION_OPTIONS_MOCK,
            smartContractAccount,
          },
        );

        await hash();

        expect(smartContractAccount.prepareUserOperation).toHaveBeenCalledTimes(
          1,
        );
        expect(smartContractAccount.updateUserOperation).toHaveBeenCalledTimes(
          1,
        );
      });
    });

    it('validates arguments', async () => {
      const controller = new UserOperationController(optionsMock);

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

    if (method === 'addUserOperationFromTransaction') {
      it('sets data as undefined if empty string', async () => {
        const controller = new UserOperationController(optionsMock);

        await addUserOperation(
          controller,
          { ...ADD_USER_OPERATION_REQUEST_MOCK, data: '' },
          {
            ...ADD_USER_OPERATION_OPTIONS_MOCK,
            smartContractAccount,
          },
        );

        await flushPromises();

        expect(smartContractAccount.prepareUserOperation).toHaveBeenCalledTimes(
          1,
        );
        expect(smartContractAccount.prepareUserOperation).toHaveBeenCalledWith(
          expect.objectContaining({
            data: undefined,
          }),
        );
      });

      it('uses transaction type from request options', async () => {
        const controller = new UserOperationController(optionsMock);

        const { id } = await addUserOperation(
          controller,
          ADD_USER_OPERATION_REQUEST_MOCK,
          {
            ...ADD_USER_OPERATION_OPTIONS_MOCK,
            smartContractAccount,
            type: TransactionType.swap,
          },
        );

        await flushPromises();

        expect(controller.state.userOperations[id].transactionType).toBe(
          TransactionType.swap,
        );

        expect(determineTransactionTypeMock).toHaveBeenCalledTimes(0);
      });

      it('determines transaction type if not set', async () => {
        const controller = new UserOperationController(optionsMock);

        const { id } = await addUserOperation(
          controller,
          ADD_USER_OPERATION_REQUEST_MOCK,
          {
            ...ADD_USER_OPERATION_OPTIONS_MOCK,
            smartContractAccount,
          },
        );

        await flushPromises();

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
  });

  describe('startPollingByNetworkClientId', () => {
    it('starts polling in PendingUserOperationTracker', async () => {
      const controller = new UserOperationController(optionsMock);

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

        const controller = new UserOperationController(optionsMock);

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

        const controller = new UserOperationController(optionsMock);

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

        const controller = new UserOperationController(optionsMock);

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

        const controller = new UserOperationController(optionsMock);

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
          ...optionsMock,
          state: {
            userOperations: {
              [USER_OPERATION_METADATA_MOCK.id]: {
                ...USER_OPERATION_METADATA_MOCK,
              },
              testId2: {
                ...USER_OPERATION_METADATA_MOCK,
                id: 'testId2',
              },
            },
          },
        });

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
