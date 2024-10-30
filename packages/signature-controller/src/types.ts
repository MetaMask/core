import type { SIWEMessage } from '@metamask/controller-utils';
import type { SignTypedDataVersion } from '@metamask/keyring-controller';
import type { Hex, Json } from '@metamask/utils';

/** Original client request that triggered the signature request. */
export type OriginalRequest = {
  /** Unique ID to identify the client request. */
  id?: number;

  /** Method of signature request */
  method?: string;

  /** ID of the network client associated with the request. */
  networkClientId?: string;

  /** Source of the client request. */
  origin?: string;

  /** Parameters in signature request */
  params?: string[];

  /** Response following a security scan of the request. */
  securityAlertResponse?: Record<string, Json>;
};

/** Options for signing typed data. */
export type TypedSigningOptions = {
  /** Whether to automatically convert JSON string data to an object. */
  parseJsonData: boolean;
};

/** The message parameters that were requested to be signed. */
export type MessageParams = {
  /** Whether to delay marking the request as signed until a signature is provided via `setDeferredSignSuccess`. */
  deferSetAsSigned?: boolean;

  /** Ethereum address to sign with. */
  from: string;

  /** ID of the associated signature request. */
  metamaskId?: string;

  /**
   * Source of the request.
   * Such as a hostname of a dApp.
   */
  origin?: string;

  /**
   * ID of the request that triggered this signature request.
   */
  requestId?: number;
};

export type StateSIWEMessage = Omit<SIWEMessage, 'parsedMessage'> & {
  parsedMessage: Omit<SIWEMessage['parsedMessage'], 'constructor'>;
};

/** Personal message parameters that were requested to be signed. */
export type MessageParamsPersonal = MessageParams & {
  /** Hexadecimal data to sign. */
  data: string;

  /** Sign-In With Ethereum data extracted from the data. */
  siwe?: StateSIWEMessage;
};

/** Typed message parameters that were requested to be signed. */
export type MessageParamsTyped = MessageParams & {
  /** Structured data to sign. */
  data:
    | Record<string, Json>[]
    | string
    | {
        types: Record<string, Json>;
        domain: Record<string, Json>;
        primaryType: string;
        message: Json;
      };
  /** Version of the signTypedData request. */
  version?: string;
};

/** Information about various state changes returned by decoding api. */
type DecodingDataStateChanges = {
  assetType: string;
  changeType: string;
  address: string;
  amount: string;
  contractAddress: string;
}[];

/** Error details for unfulfilled the decoding request. */
type DecodingDataError = {
  assetType: string;
  changeType: string;
  address: string;
  amount: string;
  contractAddress: string;
}[];

/** Decoding data about typed sign V4 signature request. */
export type DecodingData = {
  stateChanges: DecodingDataStateChanges | null;
  error: DecodingDataError;
};

type SignatureRequestBase = {
  /** ID of the associated chain. */
  chainId: Hex;

  /** Response from message decoding api. */
  decodingData?: DecodingData;

  /** Field to know if decoding request is in progress */
  decodingLoading?: boolean;

  /** Error message that occurred during the signing. */
  error?: string;

  /** Unique ID to identify this request. */
  id: string;

  /** Custom metadata stored with the request. */
  metadata?: Json;

  /** ID of the associated network client. */
  networkClientId: string;

  /** Signature hash resulting from the request. */
  rawSig?: string;

  /** Response following a security scan of the request. */
  securityAlertResponse?: Record<string, Json>;

  /** Options used for signing. */
  signingOptions?: TypedSigningOptions;

  /** Current status of the request. */
  status: string;

  /** Time the request was created. */
  time: number;

  /** Version of the signTypedData request. */
  version?: SignTypedDataVersion;
};

/** Legacy messages stored in the state. */
export type LegacyStateMessage = SignatureRequestBase & {
  /** Message parameters that were requested to be signed. */
  msgParams: MessageParamsPersonal | MessageParamsTyped;

  /** Type of the signature request. */
  type: string;
};

/** Metadata concerning a request to sign data. */
export type SignatureRequest = SignatureRequestBase &
  (
    | {
        messageParams: MessageParamsPersonal;
        type: SignatureRequestType.PersonalSign;
      }
    | {
        messageParams: MessageParamsTyped;
        type: SignatureRequestType.TypedSign;
      }
  );

/** Status of a signature request. */
export enum SignatureRequestStatus {
  Unapproved = 'unapproved',
  Approved = 'approved',
  Rejected = 'rejected',
  InProgress = 'inProgress',
  Signed = 'signed',
  Errored = 'errored',
}

/** Type of supported signature requests. */
export enum SignatureRequestType {
  PersonalSign = 'personal_sign',
  TypedSign = 'eth_signTypedData',
}
