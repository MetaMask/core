import type { Step } from './types';

/**
 * Step 0: Associate the Money Account address with the user's CHOMP profile.
 *
 * Signs "CHOMP Authentication {timestamp}" via personal_sign and submits
 * it to CHOMP. The API accepts 409 (already associated) as success.
 *
 * @param context - The step context provided by the controller.
 * @param context.messenger - The controller messenger.
 * @param context.address - The Money Account address to associate.
 * @returns A patch marking `associate-address` as the completed step.
 */
export const associateAddress: Step = async ({ messenger, address }) => {
  const timestamp = Date.now().toString();
  const message = `CHOMP Authentication ${timestamp}`;

  const signature = await messenger.call(
    'KeyringController:signPersonalMessage',
    { data: message, from: address },
  );

  await messenger.call('ChompApiService:associateAddress', {
    signature,
    timestamp,
    address,
  });

  return { step: 'associate-address' };
};
