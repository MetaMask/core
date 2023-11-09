import { onUserOperationRequest as simpleAccountRequest } from './simple-account/SimpleAccount';
import { OnUserOperationRequest, OnUserOperationResponse } from './types';

const SNAP_REQUEST_BY_ID = {
  'simple-account': simpleAccountRequest,
};

export function sendSnapRequest(
  id: string,
  request: OnUserOperationRequest,
): Promise<OnUserOperationResponse> {
  const idKey = id as keyof typeof SNAP_REQUEST_BY_ID;
  const snapRequest = SNAP_REQUEST_BY_ID[idKey];

  if (!snapRequest) {
    throw new Error(`No SCA snap found for ID: ${id}`);
  }

  return snapRequest(request);
}
