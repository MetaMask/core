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
export {
  PHISHING_DETECTION_PATH_BASED_ROOT_DOMAINS,
  getPhishingDetectionScanUrlParam,
  isAddressScanSupportedChainId,
  isPhishingDetectionPathBasedHostname,
  resolveChainName,
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

export {
  PhishingDataService,
  SCAN_RESULT_STALE_TIME,
  DEFAULT_PHISHING_PERSISTENCE_CONFIG,
} from './PhishingDataService.js';
export type { TokenScanResultResponse } from './PhishingDataService.js';
export type {
  PhishingDataServiceActions,
  PhishingDataServiceEvents,
  PhishingDataServiceMessenger,
  PhishingDataServiceInvalidateQueriesAction,
  PhishingDataServiceCacheUpdatedEvent,
  PhishingDataServiceGranularCacheUpdatedEvent,
} from './PhishingDataService.js';
export type {
  PhishingDataServiceGetStalelistAction,
  PhishingDataServiceGetHotlistDiffsAction,
  PhishingDataServiceGetC2DomainBlocklistAction,
  PhishingDataServiceScanUrlAction,
  PhishingDataServiceBulkScanUrlsAction,
  PhishingDataServiceScanTokenAction,
  PhishingDataServiceBulkScanTokensAction,
  PhishingDataServiceScanAddressAction,
  PhishingDataServiceGetApprovalsAction,
} from './PhishingDataService-method-action-types.js';
