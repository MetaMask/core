/* eslint-disable jsdoc/require-jsdoc */

import simpleAccountSnap from './simple-account';
import type {
  AccountSnap,
  OnPaymasterRequest,
  OnPaymasterResponse,
  OnUserOperationRequest,
  OnUserOperationResponse,
  OnUserOperationSignatureRequest,
  OnUserOperationSignatureResponse,
} from './types';

const SNAPS_BY_ID = {
  'simple-account': simpleAccountSnap,
};

export function sendSnapUserOperationRequest(
  snapId: string,
  request: OnUserOperationRequest,
): Promise<OnUserOperationResponse> {
  return getAccountSnap(snapId).onUserOperationRequest(request);
}

export function sendSnapPaymasterRequest(
  snapId: string,
  request: OnPaymasterRequest,
): Promise<OnPaymasterResponse> {
  return getAccountSnap(snapId).onPaymasterRequest(request);
}

export function sendSnapUserOperationSignatureRequest(
  snapId: string,
  request: OnUserOperationSignatureRequest,
): Promise<OnUserOperationSignatureResponse> {
  return getAccountSnap(snapId).onUserOperationSignatureRequest(request);
}

function getAccountSnap(snapId: string): AccountSnap {
  const idKey = snapId as keyof typeof SNAPS_BY_ID;
  const accountSnap = SNAPS_BY_ID[idKey];

  if (!accountSnap) {
    throw new Error(`No SCA snap found for ID: ${snapId}`);
  }

  return accountSnap;
}
