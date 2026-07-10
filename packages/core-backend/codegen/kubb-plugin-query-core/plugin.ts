import { definePlugin, getBarrelFiles, getMode } from '@kubb/core';
import { OperationGenerator, pluginOasName } from '@kubb/plugin-oas';
import { pluginTsName } from '@kubb/plugin-ts';
import path from 'node:path';

import { pluginSuperstructName } from '../kubb-plugin-superstruct';
import { camelCase, pascalCase } from '../utils/casing';
import { queryCoreGenerator } from './generators/queryCoreGenerator';
import type { PluginQueryCore } from './types';

export const pluginQueryCoreName =
  'plugin-query-core' satisfies PluginQueryCore['name'];

/**
 * Kubb plugin that generates framework-agnostic TanStack `query-core`
 * bindings for every operation in an OpenAPI document.
 *
 * For every operation the plugin generates:
 * - a query key factory (`<operationId>QueryKey`),
 * - a query options factory (`<operationId>QueryOptions`) whose `queryFn`
 *   performs the request through an injected {@link ApiRequestClient} and
 *   validates the response with the `@metamask/superstruct` struct generated
 *   by `plugin-superstruct`, and
 * - a `fetch<OperationName>` convenience function that runs the query through
 *   the client's `QueryClient`.
 *
 * Depends on `plugin-ts` (for types) and `plugin-superstruct` (for response
 * validation).
 */
export const pluginQueryCore = definePlugin<PluginQueryCore>((options = {}) => {
  const {
    output = { path: 'queries', barrelType: 'named' },
    exclude = [],
    include,
    override = [],
    transformers = {},
    contentType,
    queryKeyPrefix = 'api',
    runtimeImportPath = '../../../api/query-runtime',
    generators = [queryCoreGenerator],
  } = options;

  return {
    name: pluginQueryCoreName,
    options: {
      output,
      contentType,
      include,
      exclude,
      override,
      queryKeyPrefix,
      runtimeImportPath,
      transformers,
    },
    pre: [pluginOasName, pluginTsName, pluginSuperstructName],
    resolvePath(baseName, pathMode): string {
      const root = path.resolve(this.config.root, this.config.output.path);
      const mode = pathMode ?? getMode(path.resolve(root, output.path));

      if (mode === 'single') {
        return path.resolve(root, output.path);
      }

      return path.resolve(root, output.path, baseName);
    },
    resolveName(name, type): string {
      const resolvedName = type === 'type' ? pascalCase(name) : camelCase(name);

      if (type) {
        return transformers?.name?.(resolvedName, type) ?? resolvedName;
      }

      return resolvedName;
    },
    async install(): Promise<void> {
      const root = path.resolve(this.config.root, this.config.output.path);
      const mode = getMode(path.resolve(root, output.path));
      const oas = await this.getOas();

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
