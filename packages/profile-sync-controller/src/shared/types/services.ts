import type { Platform } from '../env';

export type ClientMetaMetrics = {
  metametricsId: string;
  agent: Platform.EXTENSION | Platform.MOBILE;
  appVersion: string;
};

export type MetaMetricsAuth = {
  getMetaMetricsId: () =>
    | ClientMetaMetrics['metametricsId']
    | Promise<ClientMetaMetrics['metametricsId']>;
  agent: ClientMetaMetrics['agent'];
  /**
   * Optional callback returning the current client app version (e.g. extension
   * or mobile build version). Forwarded as `metametrics.app_version` in the
   * `POST /api/v2/srp/login` payload.
   */
  getAppVersion?: () =>
    | ClientMetaMetrics['appVersion']
    | undefined
    | Promise<ClientMetaMetrics['appVersion'] | undefined>;
};
