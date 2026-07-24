export * from './PhishingController.js';
export { findSimilarAddresses } from './address-poisoning.js';
export type {
  LegacyPhishingDetectorList,
  PhishingDetectorList,
  FuzzyTolerance,
  PhishingDetectorOptions,
  PhishingDetectorConfiguration,
} from './PhishingDetector.js';
export { PhishingDetector } from './PhishingDetector.js';
export type {
  PhishingDetectionScanResult,
  AddressScanResult,
  BulkTokenScanResponse,
  SimilarAddressMatch,
  SimilarityOptions,
  ApprovalsResponse,
  Approval,
  Allowance,
  ApprovalAsset,
  Exposure,
  Spender,
  ApprovalFeature,
} from './types.js';
export type { TokenScanCacheData } from './types.js';
export { TokenScanResultType } from './types.js';
export {
  PhishingDetectorResultType,
  RecommendedAction,
  AddressScanResultType,
  ApprovalResultType,
  ApprovalFeatureType,
} from './types.js';
export type { CacheEntry } from './CacheManager.js';
export {
  PHISHING_DETECTION_PATH_BASED_ROOT_DOMAINS,
  getPhishingDetectionScanUrlParam,
  isPhishingDetectionPathBasedHostname,
} from './utils.js';

export type {
  PhishingControllerMaybeUpdateStateAction,
  PhishingControllerTestOriginAction,
  PhishingControllerIsBlockedRequestAction,
  PhishingControllerBypassAction,
  PhishingControllerScanUrlAction,
  PhishingControllerBulkScanUrlsAction,
  PhishingControllerBulkScanTokensAction,
  PhishingControllerScanAddressAction,
  PhishingControllerGetApprovalsAction,
  PhishingControllerCheckAddressPoisoningAction,
} from './PhishingController-method-action-types.js';
