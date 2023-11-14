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

export type OnUserOperationResponse = {
  callData: string;
  initCode: string;
  nonce: string;
  sender: string;
};

export type OnPaymasterResponse = {
  paymasterAndData: string;
};

export type OnUserOperationHandler = (
  request: OnUserOperationRequest,
) => Promise<OnUserOperationResponse>;

export type OnPaymasterHandler = (
  request: OnPaymasterRequest,
) => Promise<OnPaymasterResponse>;

export type AccountSnap = {
  onUserOperationRequest: OnUserOperationHandler;
  onPaymasterRequest: OnPaymasterHandler;
};
