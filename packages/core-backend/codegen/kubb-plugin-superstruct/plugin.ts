import path from 'node:path';

import { definePlugin, getBarrelFiles, getMode } from '@kubb/core';
import type { Group } from '@kubb/core';
import { OperationGenerator, SchemaGenerator, pluginOasName } from '@kubb/plugin-oas';

import { superstructGenerator } from './generators/superstructGenerator';
import type { PluginSuperstruct } from './types';
import { camelCase, pascalCase } from '../utils/casing';

export const pluginSuperstructName = 'plugin-superstruct' satisfies PluginSuperstruct['name'];

/**
 * Kubb plugin that generates `@metamask/superstruct` structs from an OpenAPI
 * document.
 *
 * For every component schema and every operation (path params, query params,
 * request body and response) a `<Name>Struct` is generated, following the
 * naming convention used across MetaMask packages.
 */
export const pluginSuperstruct = definePlugin<PluginSuperstruct>((options = {}) => {
  const {
    output = { path: 'schemas', barrelType: 'named' },
    group,
    exclude = [],
    include,
    override = [],
    transformers = {},
    importPath = '@metamask/superstruct',
    contentType,
    generators = [superstructGenerator],
  } = options;

  return {
    name: pluginSuperstructName,
    options: {
      output,
      group,
      contentType,
      include,
      exclude,
      override,
      importPath,
      transformers,
      // Options consumed by Kubb's SchemaGenerator. Dates, times and other
      // string formats are all treated as strings on the wire.
      dateType: 'string',
      unknownType: 'unknown',
      emptySchemaType: 'unknown',
      usedEnumNames: {},
    },
    pre: [pluginOasName],
    resolvePath(baseName, pathMode, resolvePathOptions) {
      const root = path.resolve(this.config.root, this.config.output.path);
      const mode = pathMode ?? getMode(path.resolve(root, output.path));

      if (mode === 'single') {
        return path.resolve(root, output.path);
      }

      if (group && (resolvePathOptions?.group?.path || resolvePathOptions?.group?.tag)) {
        const groupName: Group['name'] = group.name
          ? group.name
          : (context) => {
              if (group.type === 'path') {
                return `${context.group.split('/')[1]}`;
              }
              return `${camelCase(context.group)}Controller`;
            };

        return path.resolve(
          root,
          output.path,
          groupName({
            group:
              group.type === 'path'
                ? (resolvePathOptions.group.path as string)
                : (resolvePathOptions.group.tag as string),
          }),
          baseName,
        );
      }

      return path.resolve(root, output.path, baseName);
    },
    resolveName(name, type) {
      // Structs follow the `<PascalCaseName>Struct` convention used across
      // MetaMask packages; files use the camelCase variant. References
      // between structs are resolved with `type: 'function'`, so those must
      // match the exported (PascalCase) names.
      const resolvedName =
        type === 'file'
          ? camelCase(`${name}Struct`)
          : pascalCase(`${name}Struct`);

      if (type) {
        return transformers?.name?.(resolvedName, type) || resolvedName;
      }

      return resolvedName;
    },
    async install() {
      const root = path.resolve(this.config.root, this.config.output.path);
      const mode = getMode(path.resolve(root, output.path));
      const oas = await this.getOas();

      const schemaGenerator = new SchemaGenerator(this.plugin.options, {
        fabric: this.fabric,
        oas,
        pluginManager: this.pluginManager,
        events: this.events,
        plugin: this.plugin,
        contentType,
        include: undefined,
        override,
        mode,
        output: output.path,
      });

      const schemaFiles = await schemaGenerator.build(...generators);
      await this.upsertFile(...schemaFiles);

      const operationGenerator = new OperationGenerator(this.plugin.options, {
        fabric: this.fabric,
        oas,
        pluginManager: this.pluginManager,
        events: this.events,
        plugin: this.plugin,
        contentType,
        exclude,
        include,
        override,
        mode,
      });

      const operationFiles = await operationGenerator.build(...generators);
      await this.upsertFile(...operationFiles);

      const barrelFiles = await getBarrelFiles(this.fabric.files, {
        root,
        output,
        meta: {
          pluginKey: this.plugin.key,
        },
      });

      await this.upsertFile(...barrelFiles);
    },
  };
});
