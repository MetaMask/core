import { Caip25Errors } from './errors';

describe('Caip25Errors', () => {
  it('unknownErrorOrNoScopesAuthorized', () => {
    expect(Caip25Errors.unknownErrorOrNoScopesAuthorized().message).toBe(
      'Unknown error with request',
    );
    expect(Caip25Errors.unknownErrorOrNoScopesAuthorized().code).toBe(5000);
  });

  it('requestedChainsNotSupportedError', () => {
    expect(Caip25Errors.requestedChainsNotSupportedError().message).toBe(
      'Requested networks are not supported',
    );
    expect(Caip25Errors.requestedChainsNotSupportedError().code).toBe(5100);
  });

  it('requestedMethodsNotSupportedError', () => {
    expect(Caip25Errors.requestedMethodsNotSupportedError().message).toBe(
      'Requested methods are not supported',
    );
    expect(Caip25Errors.requestedMethodsNotSupportedError().code).toBe(5101);
  });

  it('requestedNotificationsNotSupportedError', () => {
    expect(Caip25Errors.requestedNotificationsNotSupportedError().message).toBe(
      'Requested notifications are not supported',
    );
    expect(Caip25Errors.requestedNotificationsNotSupportedError().code).toBe(
      5102,
    );
  });

  it('unknownMethodsRequestedError', () => {
    expect(Caip25Errors.unknownMethodsRequestedError().message).toBe(
      'Unknown method(s) requested',
    );
    expect(Caip25Errors.unknownMethodsRequestedError().code).toBe(5201);
  });

  it('unknownNotificationsRequestedError', () => {
    expect(Caip25Errors.unknownNotificationsRequestedError().message).toBe(
      'Unknown notification(s) requested',
    );
    expect(Caip25Errors.unknownNotificationsRequestedError().code).toBe(5202);
  });

  it('invalidSessionPropertiesError', () => {
    expect(Caip25Errors.invalidSessionPropertiesError().message).toBe(
      'Invalid sessionProperties requested',
    );
    expect(Caip25Errors.invalidSessionPropertiesError().code).toBe(5302);
  });
});
