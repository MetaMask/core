import { SeedlessOnboardingController } from './SeedlessOnboardingController';
import type { SeedlessOnboardingControllerMessenger } from './types';

/**
 * Creates a mock user operation messenger.
 *
 * @returns The mock user operation messenger.
 */
function buildSeedlessOnboardingControllerMessenger() {
  return {
    call: jest.fn(),
    publish: jest.fn(),
    registerActionHandler: jest.fn(),
    registerInitialEventPayload: jest.fn(),
    subscribe: jest.fn(),
  } as unknown as jest.Mocked<SeedlessOnboardingControllerMessenger>;
}

describe('SeedlessOnboardingController', () => {
  describe('constructor', () => {
    it('should initialize the controller with the given options', () => {
      const messenger = buildSeedlessOnboardingControllerMessenger();
      const controller = new SeedlessOnboardingController({
        messenger,
      });

      expect(controller.state).toStrictEqual({
        isNewUser: true,
        vault: undefined,
      });
    });

    it('should be able to overwrite the default state', () => {
      const messenger = buildSeedlessOnboardingControllerMessenger();
      const controller = new SeedlessOnboardingController({
        messenger,
        state: { isNewUser: false, vault: 'test' },
      });

      expect(controller.state).toStrictEqual({
        isNewUser: false,
        vault: 'test',
      });
    });
  });
});
