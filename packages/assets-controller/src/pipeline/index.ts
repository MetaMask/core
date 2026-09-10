/**
 * Assembly and execution of the assets middleware pipeline.
 *
 * The individual middlewares and data sources live in `../middlewares/` and
 * `../data-sources/`; this directory is where they are ordered into a lane and
 * driven. Keeping the two apart means a lane can be composed and run without
 * booting `AssetsController`.
 */
export { buildFastFetchSources } from './buildFastFetchSources.js';
export type { FastFetchSources } from './buildFastFetchSources.js';
export { executeAssetsPipeline } from './executeAssetsPipeline.js';
export type { ExecuteAssetsPipelineParams } from './executeAssetsPipeline.js';
