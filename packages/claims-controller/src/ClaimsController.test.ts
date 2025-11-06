import type {
  ClaimsControllerMessenger,
  ClaimsControllerOptions,
} from './ClaimsController';
import { ClaimsController } from './ClaimsController';
import type { ClaimsControllerState } from './types';
import {
  createMockMessenger,
  type RootMessenger,
} from '../tests/mocks/messenger';

/**
 * Helper function to create controller with options.
 */
type WithControllerCallback<ReturnValue> = (params: {
  controller: ClaimsController;
  initialState: ClaimsControllerState;
  messenger: ClaimsControllerMessenger;
  rootMessenger: RootMessenger;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = Partial<ClaimsControllerOptions>;

type WithControllerArgs<ReturnValue> =
  | [WithControllerCallback<ReturnValue>]
  | [WithControllerOptions, WithControllerCallback<ReturnValue>];

/**
 * Builds a controller based on the given options and calls the given function with that controller.
 *
 * @param args - Either a function, or an options bag + a function.
 * @returns Whatever the callback returns.
 */
async function withController<ReturnValue>(
  ...args: WithControllerArgs<ReturnValue>
) {
  const [{ ...rest }, fn] = args.length === 2 ? args : [{}, args[0]];
  const { messenger, rootMessenger } = createMockMessenger();

  const controller = new ClaimsController({
    messenger,
    ...rest,
  });

  return await fn({
    controller,
    initialState: controller.state,
    messenger,
    rootMessenger,
  });
}

describe('ClaimsController', () => {
  describe('constructor', () => {
    it('should be defined', () => {
      expect(ClaimsController).toBeDefined();
    });
  });

  describe('getSubmitClaimConfig', () => {
    it('should be defined', async () => {
      await withController(async ({ controller }) => {
        const submitClaimConfig = await controller.getSubmitClaimConfig({
          chainId: '0x1',
          email: 'test@test.com',
          impactedWalletAddress: '0x123',
          reimbursementWalletAddress: '0x456',
        });
        expect(submitClaimConfig).toBeDefined();
      });
    });
  });
});
