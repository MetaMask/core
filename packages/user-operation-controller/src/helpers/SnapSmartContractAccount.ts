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

export class SnapSmartContractAccount implements SmartContractAccount {
  #messenger: UserOperationControllerMessenger;

  constructor(messenger: UserOperationControllerMessenger) {
    this.#messenger = messenger;
  }

  toEip155ChainId(chainId: string): string {
    const chainIdNumber = Number(chainId);

    // If for some reason the chainId isn't convertible to a decimal integer representation, we fallback
    // to the initial `chainId`.
    return Number.isInteger(chainIdNumber) ? chainIdNumber.toString() : chainId;
  }

  async prepareUserOperation(
    request: PrepareUserOperationRequest,
  ): Promise<PrepareUserOperationResponse> {
    const {
      chainId,
      data: requestData,
      from: sender,
      to: requestTo,
      value: requestValue,
    } = request;

    const data = requestData ?? EMPTY_BYTES;
    const to = requestTo ?? ADDRESS_ZERO;
    const value = requestValue ?? VALUE_ZERO;

    const response = await this.#messenger.call(
      'KeyringController:prepareUserOperation',
      sender,
      [{ data, to, value }],
      { chainId: this.toEip155ChainId(chainId) },
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
  }

  async updateUserOperation(
    request: UpdateUserOperationRequest,
  ): Promise<UpdateUserOperationResponse> {
    const { chainId, userOperation } = request;
    const { sender } = userOperation;

    const { paymasterAndData: responsePaymasterAndData } =
      await this.#messenger.call(
        'KeyringController:patchUserOperation',
        sender,
        userOperation,
        { chainId: this.toEip155ChainId(chainId) },
      );

    const paymasterAndData =
      responsePaymasterAndData === EMPTY_BYTES
        ? undefined
        : responsePaymasterAndData;

    return {
      paymasterAndData,
    };
  }

  async signUserOperation(
    request: SignUserOperationRequest,
  ): Promise<SignUserOperationResponse> {
    const { chainId, userOperation } = request;
    const { sender } = userOperation;

    const signature = await this.#messenger.call(
      'KeyringController:signUserOperation',
      sender,
      userOperation,
      { chainId: this.toEip155ChainId(chainId) },
    );

    return { signature };
  }
}
