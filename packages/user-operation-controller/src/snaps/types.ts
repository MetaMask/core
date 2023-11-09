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

export type OnUserOperationResponse = {
  callData: string;
  initCode: string;
  nonce: string;
  paymasterAndData: string;
  sender: string;
};

export type OnUserOperationHandler = (
  request: OnUserOperationRequest,
) => Promise<OnUserOperationResponse>;
