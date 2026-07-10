import type { Plugin as KubbPlugin, PluginManager } from '@kubb/core';
import type { KubbFile } from '@kubb/fabric-core/types';
import type { OperationSchema, Schema } from '@kubb/plugin-oas';
import { SchemaGenerator } from '@kubb/plugin-oas';
import { createGenerator } from '@kubb/plugin-oas/generators';
import { getBanner, getFooter, getImports } from '@kubb/plugin-oas/utils';

import { parse } from '../parser';
import type { PluginSuperstruct } from '../types';

/**
 * A named schema (component schema or operation schema) that should be
 * emitted as a struct.
 */
type NamedSchemaTree = {
  name: string;
  tree: Schema[];
  description?: string;
};

/**
 * Renders the source code of a single schema file: the
 * `@metamask/superstruct` import plus one exported struct per schema.
 *
 * @param trees - The named schema trees to emit.
 * @param pluginManager - The Kubb plugin manager, used to resolve struct
 * names.
 * @param plugin - The current plugin instance.
 * @returns The rendered sources and the helpers that must be imported.
 */
function renderStructs(
  trees: NamedSchemaTree[],
  pluginManager: PluginManager,
  plugin: KubbPlugin<PluginSuperstruct>,
): { sources: KubbFile.Source[]; usedHelpers: Set<string> } {
  const usedHelpers = new Set<string>();

  const sources = trees.map(({ name, tree, description }): KubbFile.Source => {
    const structName = pluginManager.resolveName({
      name,
      pluginKey: plugin.key,
      type: 'const',
    });
    const expression = parse(tree, { usedHelpers }) || 'unknown()';
    if (expression === 'unknown()') {
      usedHelpers.add('unknown');
    }

    const jsdoc = description
      ? `/**\n * ${description.replace(/\n/gu, '\n * ')}\n */\n`
      : '';

    return {
      name: structName,
      value: `${jsdoc}export const ${structName} = ${expression};`,
      isExportable: true,
      isIndexable: true,
    };
  });

  return { sources, usedHelpers };
}

/**
 * Generator for `@metamask/superstruct` structs.
 *
 * The `schema` hook emits one file per named component schema; the
 * `operation` hook emits one file per operation containing structs for its
 * path params, query params, request body and response.
 */
export const superstructGenerator = createGenerator<PluginSuperstruct>({
  name: 'superstruct',

  async schema({ schema, generator, config }) {
    const { pluginManager, plugin, mode, oas } = generator.context;

    const file = pluginManager.getFile({
      name: pluginManager.resolveName({
        name: schema.name,
        pluginKey: plugin.key,
        type: 'file',
      }),
      extname: '.ts',
      mode,
      pluginKey: plugin.key,
    });

    const { sources, usedHelpers } = renderStructs(
      [
        {
          name: schema.name,
          tree: schema.tree,
          description: schema.value.description,
        },
      ],
      pluginManager,
      plugin,
    );

    const refImports = getImports(schema.tree);

    return [
      {
        ...file,
        sources,
        banner: getBanner({ oas, output: plugin.options.output, config }),
        footer: getFooter({ oas, output: plugin.options.output }),
        imports: [
          {
            name: [...usedHelpers].sort(),
            path: plugin.options.importPath,
          },
          ...refImports.map((refImport) => ({
            name: refImport.name,
            path: refImport.path,
            root: file.path,
          })),
        ],
      },
    ];
  },

  async operation({ operation, generator, config }) {
    const { pluginManager, plugin, mode, oas, fabric, events, override } =
      generator.context;

    const schemaGenerator = new SchemaGenerator(plugin.options, {
      fabric,
      oas,
      pluginManager,
      plugin,
      events,
      mode,
      override,
    });

    const operationSchemas = generator.getSchemas(operation);
    // Note: `response` aliases one of the `statusCodes` schemas, so the
    // status code schemas must be emitted first.
    const namedSchemas = [
      operationSchemas.pathParams,
      operationSchemas.queryParams,
      operationSchemas.headerParams,
      ...(operationSchemas.statusCodes ?? []),
      operationSchemas.request,
      operationSchemas.response,
    ].filter(
      (operationSchema): operationSchema is OperationSchema =>
        operationSchema?.schema !== undefined,
    );

    const trees = namedSchemas.map(
      (operationSchema): NamedSchemaTree => ({
        name: operationSchema.name,
        tree: schemaGenerator.parse({
          schema: operationSchema.schema,
          name: operationSchema.name,
          parentName: null,
        }),
        description: operationSchema.description,
      }),
    );

    const file = pluginManager.getFile({
      name: pluginManager.resolveName({
        name: operation.getOperationId(),
        pluginKey: plugin.key,
        type: 'file',
      }),
      extname: '.ts',
      mode,
      pluginKey: plugin.key,
    });

    const { sources, usedHelpers } = renderStructs(
      trees,
      pluginManager,
      plugin,
    );

    const refImports = trees.flatMap((tree) => getImports(tree.tree));

    return [
      {
        ...file,
        sources,
        banner: getBanner({ oas, output: plugin.options.output, config }),
        footer: getFooter({ oas, output: plugin.options.output }),
        imports: [
          {
            name: [...usedHelpers].sort(),
            path: plugin.options.importPath,
          },
          ...refImports.map((refImport) => ({
            name: refImport.name,
            path: refImport.path,
            root: file.path,
          })),
        ],
      },
    ];
  },
});
