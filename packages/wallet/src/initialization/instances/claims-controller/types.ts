import type { ClaimsControllerOptions } from '@metamask/claims-controller';

export type ClaimsControllerInstanceOptions = Omit<
  ClaimsControllerOptions,
  'messenger' | 'state'
>;
