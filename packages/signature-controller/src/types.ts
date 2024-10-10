/* eslint-disable @typescript-eslint/no-explicit-any */

import type { SignTypedDataVersion } from '@metamask/keyring-controller';
import type { Json } from '@metamask/utils';

export type JsonRequest = {
  origin?: string;
  securityAlertResponse?: Record<string, Json>;
};

export type MessageParams = {
  deferSetAsSigned?: boolean;
  from: string;
  origin?: string;
};

export type MessageParamsPersonal = MessageParams & {
  data: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  siwe?: any;
};

export type MessageParamsTyped = MessageParams & {
  data:
    | Record<string, any>[]
    | string
    | {
        types: Record<string, any>;
        domain: Record<string, any>;
        primaryType: string;
        message: any;
      };
};

type SignatureRequestBase = {
  error?: string;
  id: string;
  securityAlertResponse?: Record<string, Json>;
  signature?: string;
  status: SignatureRequestStatus;
  time: number;
  version?: SignTypedDataVersion;
};

export type SignatureRequest = SignatureRequestBase &
  (
    | {
        request: MessageParamsPersonal;
        type: SignatureRequestType.PersonalSign;
      }
    | {
        request: MessageParamsTyped;
        type: SignatureRequestType.TypedSign;
      }
  );

export enum SignatureRequestStatus {
  Unapproved = 'unapproved',
  Approved = 'approved',
  Rejected = 'rejected',
  Signed = 'signed',
  Errored = 'errored',
}

export enum SignatureRequestType {
  EthSign = 'eth_sign',
  PersonalSign = 'personal_sign',
  TypedSign = 'eth_signTypedData',
}
