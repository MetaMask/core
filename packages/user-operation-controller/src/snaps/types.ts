import type { UserOperation } from '../types';

export type SnapProvider = {
  request: (request: { method: string; params: any[] }) => Promise<any>;
};

export type OnUserOperationRequest = {
  to?: string;
  value?: string;
  data?: string;
  // This would be a global varable in a real snap.
  ethereum: SnapProvider;
};

export type OnPaymasterRequest = {
  userOperation: UserOperation;
  // This is only required for the POC since our example paymaster signs the user operation using our EOA.
  privateKey: string;
  // This would be a global varable in a real snap.
  ethereum: SnapProvider;
};

export type OnUserOperationSignatureRequest = {
  userOperation: UserOperation;
  chainId: string;
  // This is only required for the POC since we're not yet using the KeyringController.
  privateKey: string;
};

export type OnUserOperationResponse = {
  callData: string;
  initCode: string;
  nonce: string;
  sender: string;
};

export type OnPaymasterResponse = {
  paymasterAndData: string;
};

export type OnUserOperationSignatureResponse = {
  signature: string;
};

export type OnUserOperationHandler = (
  request: OnUserOperationRequest,
) => Promise<OnUserOperationResponse>;

export type OnPaymasterHandler = (
  request: OnPaymasterRequest,
) => Promise<OnPaymasterResponse>;

export type OnUserOperationSignatureHandler = (
  request: OnUserOperationSignatureRequest,
) => Promise<OnUserOperationSignatureResponse>;

export type AccountSnap = {
  onUserOperationRequest: OnUserOperationHandler;
  onPaymasterRequest: OnPaymasterHandler;
  onUserOperationSignatureRequest: OnUserOperationSignatureHandler;
};
