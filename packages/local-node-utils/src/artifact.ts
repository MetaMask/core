/* eslint-disable import-x/no-nodejs-modules */
import { createHash } from 'node:crypto';

import type { ArtifactConfig, ArtifactPlatformConfig } from './types.js';

export function mergeArtifactConfig(
  defaults: ArtifactConfig,
  override: ArtifactConfig | undefined,
): ArtifactConfig {
  if (!override) {
    return defaults;
  }

  return {
    version: override.version ?? defaults.version,
    platforms: { ...defaults.platforms, ...override.platforms },
  };
}

export function resolvePlatformConfig(
  config: ArtifactConfig,
  platform: string,
  label: string,
): ArtifactPlatformConfig {
  const platformConfig = config.platforms.current ?? config.platforms[platform];

  if (!platformConfig) {
    throw new Error(`No ${label} is configured for ${platform}.`);
  }

  return platformConfig;
}

export function requireCompletePlatformConfig(
  config: Partial<ArtifactPlatformConfig>,
  label: string,
): ArtifactPlatformConfig {
  if (!config.url || !config.checksum) {
    throw new Error(`${label} require both a URL and a checksum.`);
  }

  return {
    checksum: config.checksum,
    url: config.url,
  };
}

export function getCacheKey(config: ArtifactPlatformConfig): string {
  return createHash('sha256')
    .update(`${config.url}:${config.checksum}`)
    .digest('hex');
}
