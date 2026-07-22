import * as packageExports from '.';

describe('@metamask/kyc-controller', () => {
  it('exports the controller, service, selectors, and helpers', () => {
    expect(packageExports).toMatchObject({
      KycController: expect.any(Function),
      KycService: expect.any(Function),
      getDefaultKycControllerState: expect.any(Function),
      selectKycPhase: expect.any(Function),
      selectKycSumSub: expect.any(Function),
      selectIsKycRequiredForProduct: expect.any(Function),
      alpha2ToAlpha3: expect.any(Function),
      generateKeyPair: expect.any(Function),
      decryptCredentials: expect.any(Function),
      controllerName: 'KycController',
      serviceName: 'KycService',
    });
  });
});
