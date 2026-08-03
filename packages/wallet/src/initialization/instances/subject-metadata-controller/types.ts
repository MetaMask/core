/**
 * Per-instance options for the wallet's `SubjectMetadataController`.
 */
export type SubjectMetadataControllerInstanceOptions = {
  /**
   * Maximum number of distinct permissionless subjects (origins) to retain
   * metadata for, evicted oldest-first once exceeded. Subjects that hold
   * permissions are never evicted. Defaults to `100`. Must be a positive
   * integer or the controller throws, failing wallet construction.
   */
  subjectCacheLimit?: number;
};
