import { PasskeyController } from '@metamask/passkey-controller';

export type PasskeyControllerInstanceOptions = Omit<
  ConstructorParameters<typeof PasskeyController>[0],
  'messenger' | 'state'
>;
