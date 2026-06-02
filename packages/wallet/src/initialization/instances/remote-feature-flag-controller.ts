import { Messenger } from '@metamask/messenger';
import {
  RemoteFeatureFlagController,
  RemoteFeatureFlagControllerMessenger,
} from '@metamask/remote-feature-flag-controller';

import { InitializationConfiguration } from '../types';

type RemoteFeatureFlagControllerOptions = ConstructorParameters<
  typeof RemoteFeatureFlagController
>[0];

/**
 * A platform-agnostic, network-free client-config API service used when a
 * consumer does not inject its own. Its `fetchRemoteFeatureFlags` performs no
 * request and resolves to an empty flag set, so the wallet can wire a
 * functional `RemoteFeatureFlagController` headlessly (e.g. for wallet-cli).
 * Clients inject a real `ClientConfigApiService` configured for their own
 * client type, distribution, and environment via
 * `instanceOptions.remoteFeatureFlagController.clientConfigApiService` — there
 * is no single correct value to hardcode, since it differs per platform.
 *
 * Note: a consumer that intends to fetch flags but forgets to inject a service
 * will silently get an empty flag set rather than an error. Extension and
 * mobile always inject a real service (see the PR's per-environment table), so
 * this only affects deliberately headless consumers.
 */
const defaultClientConfigApiService: RemoteFeatureFlagControllerOptions['clientConfigApiService'] =
  {
    fetchRemoteFeatureFlags: async () => ({
      remoteFeatureFlags: {},
      cacheTimestamp: Date.now(),
    }),
  };

export const remoteFeatureFlagController: InitializationConfiguration<
  RemoteFeatureFlagController,
  RemoteFeatureFlagControllerMessenger
> = {
  name: 'RemoteFeatureFlagController',
  init: ({ state, messenger, options }) =>
    new RemoteFeatureFlagController({
      state,
      messenger,
      // These options differ per platform (see the PR's per-environment table),
      // so they are injected rather than hardcoded; the service and metrics-id
      // fall back to network-free/empty defaults so the controller is usable
      // headlessly.
      clientConfigApiService:
        options.clientConfigApiService ?? defaultClientConfigApiService,
      getMetaMetricsId: options.getMetaMetricsId ?? ((): string => ''),
      // `clientVersion` must be a valid 3-part SemVer or the controller throws.
      // '0.0.0' is a valid default that avoids the throw; because it is the
      // lowest possible version, any version-gated flag resolves to no match
      // and is dropped (non-version flags are unaffected). Clients pass their
      // real version so version gating works.
      clientVersion: options.clientVersion ?? '0.0.0',
      // Triggers feature-flag cache invalidation when the client version changes
      // between sessions; consumers supply the previously-run version.
      prevClientVersion: options.prevClientVersion,
      // `undefined` lets the controller apply its own defaults (1-day interval,
      // enabled). The dynamic enable/disable toggling that the clients drive
      // from their Preferences/Onboarding (extension) or basic-functionality
      // selector (mobile) stays client-side, via the controller's exposed
      // `enable`/`disable` actions on the shared messenger — those sources are
      // not wallet controllers, so they are not delegated here.
      fetchInterval: options.fetchInterval,
      disabled: options.disabled,
    }),
  getMessenger: (parent) =>
    new Messenger({
      namespace: 'RemoteFeatureFlagController',
      parent,
    }),
};
