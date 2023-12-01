import type { Provider } from '@metamask/network-controller';

export type UserOperation = {
  /** The data to pass to the sender during the main execution call. */
  callData: string;

  /** The amount of gas to allocate the main execution call. */
  callGasLimit: string;

  /**
   * The initCode of the account.
   * Needed if and only if the account is not yet on-chain and needs to be created.
   */
  initCode: string;

  /**
   * Maximum fee per gas.
   * Similar to EIP-1559 max_fee_per_gas.
   */
  maxFeePerGas: string;

  /**
   * Maximum priority fee per gas.
   * Similar to EIP-1559 max_priority_fee_per_gas.
   */
  maxPriorityFeePerGas: string;

  /** Anti-replay parameter. */
  nonce: string;

  /**
   * Address of paymaster sponsoring the transaction, followed by extra data to send to the paymaster.
   * Empty for self-sponsored transactions.
   */
  paymasterAndData: string;

  /** The amount of gas to pay to compensate the bundler for pre-verification execution, calldata and any gas overhead that can’t be tracked on-chain. */
  preVerificationGas: string;

  /** The account making the operation. */
  sender: string;

  /** Data passed into the account along with the nonce during the verification step. */
  signature: string;

  /** The amount of gas to allocate for the verification step. */
  verificationGasLimit: string;
};

export enum UserOperationStatus {
  Unapproved = 'unapproved',
  Approved = 'approved',
  Signed = 'signed',
  Submitted = 'submitted',
  Failed = 'failed',
  Confirmed = 'confirmed',
}

export type UserOperationError = {
  /**
   * A descriptive error name.
   */
  name: string;

  /**
   * A descriptive error message providing details about the encountered error.
   */
  message: string;

  /**
   * The stack trace associated with the error, if available.
   */
  stack: string | null;

  /**
   * An optional error code associated with the error.
   */
  code: string | null;

  /**
   * The rpc property holds additional information related to the error.
   */
  rpc: string | null;
};

export type UserOperationMetadata = {
  bundlerUrl: string | null;
  chainId: string;
  error: UserOperationError | null;
  hash: string | null;
  id: string;
  status: UserOperationStatus;
  time: number;
  userOperation: UserOperation;
};

export type BundlerEstimateUserOperationGasResponse = {
  preVerificationGas: number;
  verificationGas: number;
  verificationGasLimit: number;
  callGasLimit: number;
};

export type UserOperationReceipt = {
  actualGasCost: string;
  actualGasUsed: string;
  success: boolean;
  receipt: {
    blockHash: string;
    transactionHash: string;
  };
};

export type PrepareUserOperationRequest = {
  chainId: string;
  data?: string;
  provider?: Provider;
  to?: string;
  value?: string;
};

export type UpdateUserOperationRequest = {
  provider?: Provider;
  userOperation: UserOperation;
};

export type SignUserOperationRequest = {
  userOperation: UserOperation;
  chainId: string;
};

export type PrepareUserOperationResponse = {
  bundler: string;
  callData: string;
  dummyPaymasterAndData?: string;
  dummySignature?: string;
  gas?: {
    callGasLimit: string;
    preVerificationGas: string;
    verificationGasLimit: string;
  };
  initCode?: string;
  nonce: string;
  sender: string;
};

export type UpdateUserOperationResponse = {
  paymasterAndData?: string;
};

export type SignUserOperationResponse = {
  signature: string;
};

export type SmartContractAccount = {
  prepareUserOperation: (
    request: PrepareUserOperationRequest,
  ) => Promise<PrepareUserOperationResponse>;

  updateUserOperation: (
    request: UpdateUserOperationRequest,
  ) => Promise<UpdateUserOperationResponse>;

  signUserOperation: (
    request: SignUserOperationRequest,
  ) => Promise<SignUserOperationResponse>;
};
