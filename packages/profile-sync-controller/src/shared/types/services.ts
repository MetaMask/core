import type { Platform } from '../env';

export type ClientMetaMetrics = {
  metametricsId: string;
  agent: Platform.EXTENSION | Platform.MOBILE;
};

export type MetaMetricsAuth = {
  getMetaMetricsId: () =>
    | ClientMetaMetrics['metametricsId']
    | Promise<ClientMetaMetrics['metametricsId']>;
  agent: ClientMetaMetrics['agent'];
};
