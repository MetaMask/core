import type { PasskeyControllerOptions } from '@metamask/passkey-controller';

export type PasskeyControllerInstanceOptions = Omit<
  PasskeyControllerOptions,
  'messenger' | 'state'
>;
