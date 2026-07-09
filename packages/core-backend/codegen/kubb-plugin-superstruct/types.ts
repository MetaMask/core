import type {
  Group,
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
 * User-facing options for the `@metamask/superstruct` Kubb plugin.
 */
export type Options = {
  /**
   * Specify the export location for the files and define the behavior of the
   * output.
   *
   * @default { path: 'structs', barrelType: 'named' }
   */
  output?: Output<Oas>;
  /**
   * Group the superstruct schemas based on the provided name.
   */
  group?: Group;
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
   * The module that structs are imported from.
   *
   * @default '@metamask/superstruct'
   */
  importPath?: string;
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
   * Define some generators next to the superstruct generators.
   */
  generators?: OasGenerator<PluginSuperstruct>[];
};

/**
 * Options for the `@metamask/superstruct` Kubb plugin after defaults have
 * been applied. Also carries the options that Kubb's `SchemaGenerator`
 * requires (`dateType`, `unknownType`, ...), since this plugin drives schema
 * parsing through that class.
 */
export type ResolvedOptions = {
  output: Output<Oas>;
  group: Options['group'];
  contentType: Options['contentType'];
  include: Options['include'];
  exclude: Options['exclude'];
  override: NonNullable<Options['override']>;
  importPath: NonNullable<Options['importPath']>;
  transformers: NonNullable<Options['transformers']>;
  dateType: 'string';
  unknownType: 'unknown';
  emptySchemaType: 'unknown';
  usedEnumNames: Record<string, number>;
};

export type PluginSuperstruct = PluginFactoryOptions<
  'plugin-superstruct',
  Options,
  ResolvedOptions,
  never,
  ResolvePathOptions
>;
