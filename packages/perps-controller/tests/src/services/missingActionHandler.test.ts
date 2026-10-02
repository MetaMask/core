import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { MessengerActions, MockAnyNamespace } from '@metamask/messenger';

import type { PerpsControllerMessenger } from '../../../src/PerpsController.js';
import { isMissingActionHandlerError } from '../../../src/services/missingActionHandler.js';
import { createPartiallyDelegatedMessenger } from '../../helpers/serviceMocks.js';

const ACTION = 'GeolocationController:getGeolocation';

/**
 * Capture what a call throws.
 *
 * @param fn - The call to make.
 * @returns The thrown value.
 */
const thrownBy = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to throw');
};

describe('isMissingActionHandlerError', () => {
  it('matches the error for an action that was never registered', () => {
    const messenger = new Messenger<
      MockAnyNamespace,
      MessengerActions<PerpsControllerMessenger>
    >({ namespace: MOCK_ANY_NAMESPACE });

    const error = thrownBy(() => messenger.call(ACTION));

    expect((error as Error).message).toBe(
      `A handler for ${ACTION} has not been registered`,
    );
    expect(isMissingActionHandlerError(error, ACTION)).toBe(true);
  });

  it('matches the error for an action the host did not delegate', () => {
    const messenger = createPartiallyDelegatedMessenger();

    const error = thrownBy(() => messenger.call(ACTION));

    expect((error as Error).message).toBe(
      `A handler for ${ACTION} has not been delegated to PerpsController`,
    );
    expect(isMissingActionHandlerError(error, ACTION)).toBe(true);
  });

  it('does not match a missing handler for a different action', () => {
    expect(
      isMissingActionHandlerError(
        new Error(
          'A handler for AuthenticationController:getBearerToken has not been delegated to AuthenticatedUserStorageService',
        ),
        'AuthenticatedUserStorageService:getNotificationPreferences',
      ),
    ).toBe(false);
  });

  it('treats the action as a literal rather than a pattern', () => {
    expect(
      isMissingActionHandlerError(
        new Error(
          'A handler for GeolocationControllerXgetGeolocation has not been registered',
        ),
        'GeolocationController.getGeolocation',
      ),
    ).toBe(false);
  });

  it.each([
    ['a prefix', `Wrapped: A handler for ${ACTION} has not been registered`],
    ['a suffix', `A handler for ${ACTION} has not been registered (retry)`],
    ['a longer word', `A handler for ${ACTION} has not been registeredSuccess`],
    [
      'an empty namespace',
      `A handler for ${ACTION} has not been delegated to `,
    ],
    [
      'a namespace with spaces',
      `A handler for ${ACTION} has not been delegated to Perps Controller`,
    ],
    [
      'a duplicate registration',
      `A handler for ${ACTION} has already been registered`,
    ],
  ])('does not match a message with %s', (_case, message) => {
    expect(isMissingActionHandlerError(new Error(message), ACTION)).toBe(false);
  });

  it('does not match non-errors or unrelated failures', () => {
    expect(
      isMissingActionHandlerError(
        `A handler for ${ACTION} has not been registered`,
        ACTION,
      ),
    ).toBe(false);
    expect(isMissingActionHandlerError(undefined, ACTION)).toBe(false);
    expect(
      isMissingActionHandlerError(new Error('handler exploded'), ACTION),
    ).toBe(false);
  });
});
