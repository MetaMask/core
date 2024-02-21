import { ADDRESS_ZERO, EMPTY_BYTES, VALUE_ZERO } from '../constants';
import type {
  PrepareUserOperationRequest,
  PrepareUserOperationResponse,
  SignUserOperationRequest,
  SignUserOperationResponse,
  SmartContractAccount,
  UpdateUserOperationRequest,
  UpdateUserOperationResponse,
} from '../types';
import type { UserOperationControllerMessenger } from '../UserOperationController';
import { errorWithPrefix } from '../utils/errors';

export class SnapSmartContractAccount implements SmartContractAccount {
  #messenger: UserOperationControllerMessenger;

  constructor(messenger: UserOperationControllerMessenger) {
    this.#messenger = messenger;
  }

  async prepareUserOperation(
    request: PrepareUserOperationRequest,
  ): Promise<PrepareUserOperationResponse> {
    const {
      data: requestData,
      from: sender,
      to: requestTo,
      value: requestValue,
    } = request;

    const data = requestData ?? EMPTY_BYTES;
    const to = requestTo ?? ADDRESS_ZERO;
    const value = requestValue ?? VALUE_ZERO;
    try {
      const response = await this.#messenger.call(
        'KeyringController:prepareUserOperation',
        sender,
        [{ data, to, value }],
      );

      const {
        bundlerUrl: bundler,
        callData,
        dummyPaymasterAndData,
        dummySignature,
        gasLimits: gas,
        initCode,
        nonce,
      } = response;

      return {
        bundler,
        callData,
        dummyPaymasterAndData,
        dummySignature,
        gas,
        initCode,
        nonce,
        sender,
      };
    } catch (error) {
      throw errorWithPrefix(error, 'Failed to prepare user operation');
    }
  }

  async updateUserOperation(
    request: UpdateUserOperationRequest,
  ): Promise<UpdateUserOperationResponse> {
    const { userOperation } = request;
    const { sender } = userOperation;
    try {
      const { paymasterAndData: responsePaymasterAndData } =
        await this.#messenger.call(
          'KeyringController:patchUserOperation',
          sender,
          userOperation,
        );

      const paymasterAndData =
        responsePaymasterAndData === EMPTY_BYTES
          ? undefined
          : responsePaymasterAndData;

      return {
        paymasterAndData,
      };
    } catch (error) {
      throw errorWithPrefix(error, 'Failed to update user operation');
    }
  }

  async signUserOperation(
    request: SignUserOperationRequest,
  ): Promise<SignUserOperationResponse> {
    const { userOperation } = request;
    const { sender } = userOperation;
    try {
      const signature = await this.#messenger.call(
        'KeyringController:signUserOperation',
        sender,
        userOperation,
      );

      return { signature };
    } catch (error) {
      throw errorWithPrefix(error, 'Failed to sign user operation');
    }
  }
}
