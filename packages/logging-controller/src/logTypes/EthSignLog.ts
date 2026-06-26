import type { LogType } from './LogType';

/**
 * An enum of the signing method types that we are interested in logging.
 */
export enum SigningMethod {
  PersonalSign = 'personal_sign',
  EthSignTypedData = 'eth_signTypedData',
  EthSignTypedDataV3 = 'eth_signTypedData_v3',
  EthSignTypedDataV4 = 'eth_signTypedData_v4',
}

/**
 * An enum of the various stages of the signing request
 */
export enum SigningStage {
  Proposed = 'proposed',
  Rejected = 'rejected',
  Signed = 'signed',
}

/**
 * First special case of logging scenarios involves signing requests. In this
 * case the data provided must include the method for the signature request as
 * well as the signingData. This is intended to be used to troubleshoot and
 * investigate FLI at the user's request.
 */
export type EthSignLog = {
  type: LogType.EthSignLog;
  data: {
    signingMethod: SigningMethod;
    stage: SigningStage;
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    signingData?: any;
  };
};
