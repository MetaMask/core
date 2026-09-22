import * as packageExports from './index.js';

describe('@metamask/kyc-controller', () => {
  it('exports the controller, service, selectors, and helpers', () => {
    expect(packageExports).toMatchObject({
      KycController: expect.any(Function),
      KycService: expect.any(Function),
      getDefaultKycControllerState: expect.any(Function),
      selectKycVendor: expect.any(Function),
      selectKycSessionStatus: expect.any(Function),
      alpha2ToAlpha3: expect.any(Function),
      generateKeyPair: expect.any(Function),
      decryptCredentials: expect.any(Function),
      MoonPayFrameHandler: expect.any(Function),
      clearMoonPaySession: expect.any(Function),
      controllerName: 'KycController',
      serviceName: 'KycService',
    });
  });
});
