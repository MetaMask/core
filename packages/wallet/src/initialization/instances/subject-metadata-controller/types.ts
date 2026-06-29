import type { SubjectMetadataController } from '@metamask/permission-controller';

/**
 * Per-instance options for the wallet's `SubjectMetadataController`.
 */
export type SubjectMetadataControllerInstanceOptions = {
  /**
   * Maximum number of distinct permissionless subjects (origins) to retain
   * metadata for. Once exceeded, the oldest permissionless subject is evicted
   * (FIFO). Defaults to `100` when omitted, matching the extension and mobile
   * clients.
   */
  subjectCacheLimit?: ConstructorParameters<
    typeof SubjectMetadataController
  >[0]['subjectCacheLimit'];
};
