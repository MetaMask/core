import type {
  ClaimsControllerOptions,
  ClaimsServiceConfig,
} from '@metamask/claims-controller';

export type ClaimsControllerInstanceOptions = Omit<
  ClaimsControllerOptions,
  'messenger' | 'state'
>;

export type ClaimsServiceInstanceOptions = Omit<
  ClaimsServiceConfig,
  'messenger' | 'env'
> &
  Partial<Pick<ClaimsServiceConfig, 'env'>>;
