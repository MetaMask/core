import { Caip25Errors } from './errors';

describe('Caip25Errors', () => {
  it('requestedChainsNotSupportedError', () => {
    expect(Caip25Errors.requestedChainsNotSupportedError().message).toBe(
      'Requested chains are not supported',
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
});
