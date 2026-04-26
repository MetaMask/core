/**
 * Thrown and/or passed to `captureException` when one or more assets data
 * source middlewares fail during a fetch. Use Sentry's "error type" / title
 * filter on `AssetsDataSourceError` to build issue alerts.
 */
export class AssetsDataSourceError extends Error {
  /** Comma-separated data source names that failed. */
  readonly failedSources: string;

  /** Number of failed middlewares in the request. */
  readonly errorCount: number;

  /** Chains included in the request (for context). */
  readonly chainCount: number;

  /**
   * @param details - Which sources failed and request size hints.
   * @param details.failedSources - Comma-separated data source names that failed.
   * @param details.errorCount - Number of failed middlewares in the request.
   * @param details.chainCount - Chains included in the request (for context).
   */
  constructor(details: {
    failedSources: string;
    errorCount: number;
    chainCount: number;
  }) {
    super(
      `Assets data source middleware failures (${details.errorCount}): ${details.failedSources}`,
    );
    this.name = 'AssetsDataSourceError';
    this.failedSources = details.failedSources;
    this.errorCount = details.errorCount;
    this.chainCount = details.chainCount;
  }
}
