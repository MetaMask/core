import type { Hex } from '@metamask/utils';

import type { Step } from './step';

/**
 * Associates the Money Account address with the user's CHOMP profile.
 *
 * Signs `CHOMP Authentication {timestamp}` (EIP-191) with the account's key
 * and submits the signature to CHOMP, which verifies the timestamp is fresh,
 * recovers the signer, and records the profile–address mapping.
 *
 * The CHOMP endpoint is idempotent, so this step always executes and has no
 * pre-check.
 */
export const associateAddressStep: Step = {
  name: 'associate-address',
  async run({ messenger, address }) {
    const timestamp = Date.now().toString();
    const message = `CHOMP Authentication ${timestamp}`;

    const signature = (await messenger.call(
      'KeyringController:signPersonalMessage',
      { data: message, from: address },
    )) as Hex;

    await messenger.call('ChompApiService:associateAddress', {
      signature,
      timestamp,
      address,
    });

    return 'completed';
  },
};
