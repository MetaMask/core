/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { ShieldApiService } from './shield-api-service.js';

/**
 * Checks the coverage of a transaction.
 *
 * @param req - The coverage check request.
 * @returns The coverage result.
 */
export type ShieldApiServiceCheckCoverageAction = {
  type: `ShieldApiService:checkCoverage`;
  handler: ShieldApiService['checkCoverage'];
};

/**
 * Checks the coverage of a signature request.
 *
 * @param req - The signature coverage check request.
 * @returns The coverage result.
 */
export type ShieldApiServiceCheckSignatureCoverageAction = {
  type: `ShieldApiService:checkSignatureCoverage`;
  handler: ShieldApiService['checkSignatureCoverage'];
};

/**
 * Logs a signed signature request.
 *
 * @param req - The log signature request.
 */
export type ShieldApiServiceLogSignatureAction = {
  type: `ShieldApiService:logSignature`;
  handler: ShieldApiService['logSignature'];
};

/**
 * Logs a submitted transaction.
 *
 * @param req - The log transaction request.
 */
export type ShieldApiServiceLogTransactionAction = {
  type: `ShieldApiService:logTransaction`;
  handler: ShieldApiService['logTransaction'];
};

/**
 * Union of all ShieldApiService action types.
 */
export type ShieldApiServiceMethodActions =
  | ShieldApiServiceCheckCoverageAction
  | ShieldApiServiceCheckSignatureCoverageAction
  | ShieldApiServiceLogSignatureAction
  | ShieldApiServiceLogTransactionAction;
