import type { SubjectMetadataController } from '@metamask/permission-controller';

/**
 * Per-instance options for the wallet's `SubjectMetadataController`.
 */
export type SubjectMetadataControllerInstanceOptions = {
  /**
   * Maximum number of distinct permissionless subjects (origins) to retain
   * metadata for, evicted oldest-first once exceeded. Defaults to a
   * platform-agnostic value when omitted.
   */
  subjectCacheLimit?: ConstructorParameters<
    typeof SubjectMetadataController
  >[0]['subjectCacheLimit'];
};
