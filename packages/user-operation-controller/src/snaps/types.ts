export type SnapProvider = {
  request: (request: { method: string; params: any[] }) => Promise<any>;
};

export type OnUserOperationRequest = {
  sender: string;
  to?: string;
  value?: string;
  data?: string;
  // This would be a global varable in a real snap.
  ethereum: SnapProvider;
};

export type OnUserOperationResponse = {
  callData: string;
  nonce: string;
  paymasterAndData: string;
};

export type OnUserOperationHandler = (
  request: OnUserOperationRequest,
) => Promise<OnUserOperationResponse>;
