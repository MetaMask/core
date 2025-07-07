import type { KeyringController } from '@metamask/keyring-controller';

import { ADDRESS_ZERO, EMPTY_BYTES, VALUE_ZERO } from '../constants';
import type {
  PrepareUserOperationResponse,
  SignUserOperationRequest,
  SignUserOperationResponse,
  UpdateUserOperationRequest,
  UpdateUserOperationResponse,
} from '../types';
import { type PrepareUserOperationRequest } from '../types';
import type { UserOperationControllerMessenger } from '../UserOperationController';
import { toEip155ChainId } from '../utils/chain-id';
import { SnapSmartContractAccount } from './SnapSmartContractAccount';

const PREPARE_USER_OPERATION_REQUEST_MOCK: PrepareUserOperationRequest = {
  chainId: '0x1',
  data: '0x123',
  from: '0x321',
  to: '0x456',
  value: '0x789',
};

const UPDATE_USER_OPERATION_REQUEST_MOCK: UpdateUserOperationRequest = {
  userOperation: {
    callData: '0x1',
    callGasLimit: '0x2',
    initCode: '0x3',
    maxFeePerGas: '0x4',
    maxPriorityFeePerGas: '0x5',
    nonce: '0x6',
    paymasterAndData: '0x7',
    preVerificationGas: '0x8',
    sender: '0x9',
    signature: '0xa',
    verificationGasLimit: '0xb',
  },
  chainId: '0x1',
};

const SIGN_USER_OPERATION_REQUEST_MOCK: SignUserOperationRequest = {
  ...UPDATE_USER_OPERATION_REQUEST_MOCK,
  chainId: PREPARE_USER_OPERATION_REQUEST_MOCK.chainId,
};

const PREPARE_USER_OPERATION_RESPONSE_MOCK: Awaited<
  ReturnType<KeyringController['prepareUserOperation']>
> = {
  bundlerUrl: 'http://test.com:123/test',
  callData: '0x111',
  dummyPaymasterAndData: '0x222',
  dummySignature: '0x333',
  gasLimits: {
    callGasLimit: '0x444',
    verificationGasLimit: '0x555',
    preVerificationGas: '0x667',
  },
  initCode: '0x888',
  nonce: '0x999',
};

const PATCH_USER_OPERATION_RESPONSE_MOCK: Awaited<
  ReturnType<KeyringController['patchUserOperation']>
> = {
  paymasterAndData: '0x123',
  callGasLimit: '0x444',
  verificationGasLimit: '0x555',
  preVerificationGas: '0x667',
};

const SIGN_USER_OPERATION_RESPONSE_MOCK: Awaited<
  ReturnType<KeyringController['signUserOperation']>
> = '0x123';

/**
 * Creates a mock of the UserOperationControllerMessenger.
 * @returns The mock instance.
 */
function createMessengerMock() {
  return {
    call: jest.fn(),
  } as unknown as jest.Mocked<UserOperationControllerMessenger>;
}

describe('SnapSmartContractAccount', () => {
  let messengerMock: jest.Mocked<UserOperationControllerMessenger>;
  let prepareMock: jest.MockedFn<KeyringController['prepareUserOperation']>;
  let patchMock: jest.MockedFn<KeyringController['patchUserOperation']>;
  let signMock: jest.MockedFn<KeyringController['signUserOperation']>;

  beforeEach(() => {
    messengerMock = createMessengerMock();
    prepareMock = jest.fn();
    patchMock = jest.fn();
    signMock = jest.fn();

    messengerMock.call.mockImplementation(async (method: string, ...args) => {
      switch (method) {
        case 'KeyringController:prepareUserOperation':
          return prepareMock(
            ...(args as Parameters<KeyringController['prepareUserOperation']>),
          );
        case 'KeyringController:patchUserOperation':
          return patchMock(
            ...(args as Parameters<KeyringController['patchUserOperation']>),
          );
        case 'KeyringController:signUserOperation':
          return signMock(
            ...(args as Parameters<KeyringController['signUserOperation']>),
          );
        default:
          throw new Error(`Unexpected method: ${method}`);
      }
    });

    prepareMock.mockResolvedValue(PREPARE_USER_OPERATION_RESPONSE_MOCK);
    patchMock.mockResolvedValue(PATCH_USER_OPERATION_RESPONSE_MOCK);
    signMock.mockResolvedValue(SIGN_USER_OPERATION_RESPONSE_MOCK);
  });

  describe('prepareUserOperation', () => {
    it('returns data from messenger', async () => {
      const smartContractAccount = new SnapSmartContractAccount(messengerMock);

      const response = await smartContractAccount.prepareUserOperation(
        PREPARE_USER_OPERATION_REQUEST_MOCK,
      );

      expect(response).toStrictEqual<PrepareUserOperationResponse>({
        bundler: PREPARE_USER_OPERATION_RESPONSE_MOCK.bundlerUrl,
        callData: PREPARE_USER_OPERATION_RESPONSE_MOCK.callData,
        dummyPaymasterAndData:
          PREPARE_USER_OPERATION_RESPONSE_MOCK.dummyPaymasterAndData,
        dummySignature: PREPARE_USER_OPERATION_RESPONSE_MOCK.dummySignature,
        gas: PREPARE_USER_OPERATION_RESPONSE_MOCK.gasLimits,
        initCode: PREPARE_USER_OPERATION_RESPONSE_MOCK.initCode,
        nonce: PREPARE_USER_OPERATION_RESPONSE_MOCK.nonce,
        sender: PREPARE_USER_OPERATION_REQUEST_MOCK.from,
      });

      expect(prepareMock).toHaveBeenCalledTimes(1);
      expect(prepareMock).toHaveBeenCalledWith(
        PREPARE_USER_OPERATION_REQUEST_MOCK.from,
        [
          {
            data: PREPARE_USER_OPERATION_REQUEST_MOCK.data,
            to: PREPARE_USER_OPERATION_REQUEST_MOCK.to,
            value: PREPARE_USER_OPERATION_REQUEST_MOCK.value,
          },
        ],
        {
          chainId: toEip155ChainId(PREPARE_USER_OPERATION_REQUEST_MOCK.chainId),
        },
      );
    });

    it('handles missing data in request', async () => {
      const smartContractAccount = new SnapSmartContractAccount(messengerMock);

      await smartContractAccount.prepareUserOperation({
        ...PREPARE_USER_OPERATION_REQUEST_MOCK,
        data: undefined,
      });

      expect(prepareMock).toHaveBeenCalledTimes(1);
      expect(prepareMock).toHaveBeenCalledWith(
        PREPARE_USER_OPERATION_REQUEST_MOCK.from,
        [
          {
            data: EMPTY_BYTES,
            to: PREPARE_USER_OPERATION_REQUEST_MOCK.to,
            value: PREPARE_USER_OPERATION_REQUEST_MOCK.value,
          },
        ],
        {
          chainId: toEip155ChainId(PREPARE_USER_OPERATION_REQUEST_MOCK.chainId),
        },
      );
    });

    it('handles missing to in request', async () => {
      const smartContractAccount = new SnapSmartContractAccount(messengerMock);

      await smartContractAccount.prepareUserOperation({
        ...PREPARE_USER_OPERATION_REQUEST_MOCK,
        to: undefined,
      });

      expect(prepareMock).toHaveBeenCalledTimes(1);
      expect(prepareMock).toHaveBeenCalledWith(
        PREPARE_USER_OPERATION_REQUEST_MOCK.from,
        [
          {
            data: PREPARE_USER_OPERATION_REQUEST_MOCK.data,
            to: ADDRESS_ZERO,
            value: PREPARE_USER_OPERATION_REQUEST_MOCK.value,
          },
        ],
        {
          chainId: toEip155ChainId(PREPARE_USER_OPERATION_REQUEST_MOCK.chainId),
        },
      );
    });

    it('handles missing value in request', async () => {
      const smartContractAccount = new SnapSmartContractAccount(messengerMock);

      await smartContractAccount.prepareUserOperation({
        ...PREPARE_USER_OPERATION_REQUEST_MOCK,
        value: undefined,
      });

      expect(prepareMock).toHaveBeenCalledTimes(1);
      expect(prepareMock).toHaveBeenCalledWith(
        PREPARE_USER_OPERATION_REQUEST_MOCK.from,
        [
          {
            data: PREPARE_USER_OPERATION_REQUEST_MOCK.data,
            to: PREPARE_USER_OPERATION_REQUEST_MOCK.to,
            value: VALUE_ZERO,
          },
        ],
        {
          chainId: toEip155ChainId(PREPARE_USER_OPERATION_REQUEST_MOCK.chainId),
        },
      );
    });
  });

  describe('updateUserOperation', () => {
    it('returns data from messenger', async () => {
      const smartContractAccount = new SnapSmartContractAccount(messengerMock);

      const response = await smartContractAccount.updateUserOperation(
        UPDATE_USER_OPERATION_REQUEST_MOCK,
      );

      expect(response).toStrictEqual<UpdateUserOperationResponse>({
        paymasterAndData: PATCH_USER_OPERATION_RESPONSE_MOCK.paymasterAndData,
        callGasLimit: PATCH_USER_OPERATION_RESPONSE_MOCK.callGasLimit,
        preVerificationGas:
          PATCH_USER_OPERATION_RESPONSE_MOCK.preVerificationGas,
        verificationGasLimit:
          PATCH_USER_OPERATION_RESPONSE_MOCK.verificationGasLimit,
      });

      expect(patchMock).toHaveBeenCalledTimes(1);
      expect(patchMock).toHaveBeenCalledWith(
        UPDATE_USER_OPERATION_REQUEST_MOCK.userOperation.sender,
        UPDATE_USER_OPERATION_REQUEST_MOCK.userOperation,
        {
          chainId: toEip155ChainId(UPDATE_USER_OPERATION_REQUEST_MOCK.chainId),
        },
      );
    });

    it('returns undefined paymaster data if set to empty bytes', async () => {
      patchMock.mockResolvedValue({
        paymasterAndData: EMPTY_BYTES,
      });

      const smartContractAccount = new SnapSmartContractAccount(messengerMock);

      const response = await smartContractAccount.updateUserOperation(
        UPDATE_USER_OPERATION_REQUEST_MOCK,
      );

      expect(response).toStrictEqual<UpdateUserOperationResponse>({
        paymasterAndData: undefined,
        callGasLimit: undefined,
        preVerificationGas: undefined,
        verificationGasLimit: undefined,
      });
    });
  });

  describe('signUserOperation', () => {
    it('returns data from messenger', async () => {
      const smartContractAccount = new SnapSmartContractAccount(messengerMock);

      const response = await smartContractAccount.signUserOperation(
        SIGN_USER_OPERATION_REQUEST_MOCK,
      );

      expect(response).toStrictEqual<SignUserOperationResponse>({
        signature: SIGN_USER_OPERATION_RESPONSE_MOCK,
      });

      expect(signMock).toHaveBeenCalledTimes(1);
      expect(signMock).toHaveBeenCalledWith(
        SIGN_USER_OPERATION_REQUEST_MOCK.userOperation.sender,
        SIGN_USER_OPERATION_REQUEST_MOCK.userOperation,
        {
          chainId: toEip155ChainId(SIGN_USER_OPERATION_REQUEST_MOCK.chainId),
        },
      );
    });
  });
});
