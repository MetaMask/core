import type { Hex } from '@metamask/utils';

import type { Step } from './step';

/**
 * Associates the Money Account address with the user's CHOMP profile.
 *
 * Signs `CHOMP Authentication {timestamp}` (EIP-191) with the account's key
 * and submits the signature to CHOMP, which verifies the timestamp is fresh,
 * recovers the signer, and records the profile–address mapping.
 *
 * CHOMP responds with 201 and `status: 'created'` when a new association is
 * made, and 409 with `status: 'active'` when the address is already
 * associated with the authenticated profile. The service surfaces both
 * responses, so this step reports `'already-done'` for the 409 case and
 * `'completed'` otherwise.
 */
export const associateAddressStep: Step = {
  name: 'associate-address',
  async run({ messenger, address }) {
    const timestamp = Date.now();
    const message = `CHOMP Authentication ${timestamp}`;

    const signature = (await messenger.call(
      'KeyringController:signPersonalMessage',
      { data: message, from: address },
    )) as Hex;

    const response = await messenger.call('ChompApiService:associateAddress', {
      signature,
      timestamp,
      address,
    });

    if (response.status === 'active') {
      return 'already-done';
    }

    return 'completed';
  },
};
