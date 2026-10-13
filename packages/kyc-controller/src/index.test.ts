import * as packageExports from './index.js';

describe('@metamask/kyc-controller', () => {
  it('exports the controller, service, selectors, and helpers', () => {
    expect(packageExports).toMatchObject({
      KycController: expect.any(Function),
      KycService: expect.any(Function),
      getDefaultKycControllerState: expect.any(Function),
      selectKycVendor: expect.any(Function),
      selectKycSessionStatus: expect.any(Function),
      needsCapabilityAuthorizationRefresh: expect.any(Function),
      CAPABILITY_AUTHORIZATION_STATUSES: expect.any(Object),
      CAPABILITY_AUTHORIZATION_STATUSES_TO_REFRESH: expect.any(Set),
      FINAL_STATUSES_TO_SKIP_AUTH_REFRESH: expect.any(Set),
      KYC_STATUSES: expect.any(Object),
      FINAL_STATUSES_TO_STOP_POLLING: expect.any(Set),
      alpha2ToAlpha3: expect.any(Function),
      generateKeyPair: expect.any(Function),
      decryptCredentials: expect.any(Function),
      MoonPayFrameHandler: expect.any(Function),
      clearMoonPaySession: expect.any(Function),
      controllerName: 'KycController',
      serviceName: 'KycService',
    });
  });

  it('exports the KYC status constants', () => {
    expect(packageExports.KYC_STATUSES).toStrictEqual({
      approved: 'approved',
      rejected: 'rejected',
      retry: 'retry',
      new: 'new',
      pending: 'pending',
    });
    expect(packageExports.TERMINAL_SESSION_STATUSES).toBeInstanceOf(Set);
    expect([...packageExports.TERMINAL_SESSION_STATUSES].sort()).toStrictEqual([
      'approved',
      'rejected',
      'retry',
    ]);
  });
});
