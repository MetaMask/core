import type {
  Output,
  PluginFactoryOptions,
  ResolveNameParams,
} from '@kubb/core';
import type { Oas, contentType } from '@kubb/oas';
import type {
  Exclude as OasExclude,
  Include as OasInclude,
  Override,
  ResolvePathOptions,
} from '@kubb/plugin-oas';
import type { Generator as OasGenerator } from '@kubb/plugin-oas/generators';

/**
 * User-facing options for the TanStack `query-core` Kubb plugin.
 */
export type Options = {
  /**
   * Specify the export location for the files and define the behavior of the
   * output.
   *
   * @default { path: 'queries', barrelType: 'named' }
   */
  output?: Output<Oas>;
  /**
   * Define which contentType should be used. By default, the first JSON valid
   * mediaType is used.
   */
  contentType?: contentType;
  /**
   * Array containing exclude parameters to exclude/skip
   * tags/operations/methods/paths.
   */
  exclude?: OasExclude[];
  /**
   * Array containing include parameters to include tags/operations/methods/paths.
   */
  include?: OasInclude[];
  /**
   * Array containing override parameters to override `options` based on
   * tags/operations/methods/paths.
   */
  override?: Override<ResolvedOptions>[];
  /**
   * The first element of every generated query key, scoping the generated
   * queries in the QueryClient cache (e.g. `'prices'`).
   *
   * @default 'api'
   */
  queryKeyPrefix?: string;
  /**
   * Module specifier that the generated files import the request-client
   * runtime from (`ApiRequestClient`, `FetchOptions` and
   * `getQueryOptionsOverrides`). Relative specifiers are resolved from the
   * generated query files.
   *
   * @default '../../../api/query-runtime'
   */
  runtimeImportPath?: string;
  transformers?: {
    /**
     * Customize the names based on the type that is provided by the plugin.
     */
    name?: (
      name: ResolveNameParams['name'],
      type?: ResolveNameParams['type'],
    ) => string;
  };
  /**
   * Define some generators next to the query-core generators.
   */
  generators?: OasGenerator<PluginQueryCore>[];
};

/**
 * Options for the TanStack `query-core` Kubb plugin after defaults have been
 * applied.
 */
export type ResolvedOptions = {
  output: Output<Oas>;
  contentType: Options['contentType'];
  include: Options['include'];
  exclude: Options['exclude'];
  override: NonNullable<Options['override']>;
  queryKeyPrefix: NonNullable<Options['queryKeyPrefix']>;
  runtimeImportPath: NonNullable<Options['runtimeImportPath']>;
  transformers: NonNullable<Options['transformers']>;
};

export type PluginQueryCore = PluginFactoryOptions<
  'plugin-query-core',
  Options,
  ResolvedOptions,
  never,
  ResolvePathOptions
>;
