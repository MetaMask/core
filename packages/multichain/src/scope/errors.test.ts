import { Caip25Errors } from './errors';

describe('Caip25Errors', () => {
  it('requestedChainsNotSupportedError', () => {
    expect(Caip25Errors.requestedChainsNotSupportedError().message).toBe(
      'Requested chains are not supported',
    );
  });

  it('requestedMethodsNotSupportedError', () => {
    expect(Caip25Errors.requestedMethodsNotSupportedError().message).toBe(
      'Requested methods are not supported',
    );
  });

  it('requestedNotificationsNotSupportedError', () => {
    expect(Caip25Errors.requestedNotificationsNotSupportedError().message).toBe(
      'Requested notifications are not supported',
    );
  });

  it('unknownMethodsRequestedError', () => {
    expect(Caip25Errors.unknownMethodsRequestedError().message).toBe(
      'Unknown method(s) requested',
    );
  });

  it('unknownNotificationsRequestedError', () => {
    expect(Caip25Errors.unknownNotificationsRequestedError().message).toBe(
      'Unknown notification(s) requested',
    );
  });
});
