import type {
  CreateShieldRemoteBackendOptions,
  ShieldController,
} from '@metamask/shield-controller';

type ShieldControllerOptions = ConstructorParameters<
  typeof ShieldController
>[0];

type ShieldControllerCommonOptions = Pick<
  ShieldControllerOptions,
  | 'transactionHistoryLimit'
  | 'coverageHistoryLimit'
  | 'normalizeSignatureRequest'
>;

type ShieldRemoteBackendInstanceOptions = Omit<
  CreateShieldRemoteBackendOptions,
  'messenger' | 'fetch'
> & {
  fetchFunction: CreateShieldRemoteBackendOptions['fetch'];
};

/**
 * Per-instance options for the wallet's `ShieldController`. When `backend` is
 * not provided, `fetchFunction` is required so the instance can build a
 * default `ShieldRemoteBackend`; `env` is optional and defaults to production.
 */
export type ShieldControllerInstanceOptions = ShieldControllerCommonOptions &
  (
    | { backend: ShieldControllerOptions['backend'] }
    | ({ backend?: undefined } & ShieldRemoteBackendInstanceOptions)
  );
