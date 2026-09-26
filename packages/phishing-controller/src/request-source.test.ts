import {
  REQUEST_SOURCE_HEADER,
  RequestSourceFlow,
  RequestSourcePlatform,
  UNKNOWN_REQUEST_SOURCE,
  buildRequestSource,
} from './request-source.js';

describe('REQUEST_SOURCE_HEADER', () => {
  it('is the header name agreed with the phishing detection service', () => {
    expect(REQUEST_SOURCE_HEADER).toBe('x-request-source');
  });
});

describe('buildRequestSource', () => {
  const validCombinations: [
    RequestSourcePlatform,
    RequestSourceFlow,
    string,
  ][] = [
    [
      RequestSourcePlatform.Extension,
      RequestSourceFlow.DappConnection,
      'Extension-dapp-connection',
    ],
    [
      RequestSourcePlatform.Extension,
      RequestSourceFlow.RpcTrustSignals,
      'Extension-rpc-trust-signals',
    ],
    [
      RequestSourcePlatform.Extension,
      RequestSourceFlow.Confirmations,
      'Extension-confirmations',
    ],
    [
      RequestSourcePlatform.Extension,
      RequestSourceFlow.RevealSrp,
      'Extension-reveal-srp',
    ],
    [
      RequestSourcePlatform.Extension,
      RequestSourceFlow.NftDetection,
      'Extension-nft-detection',
    ],
    [
      RequestSourcePlatform.Mobile,
      RequestSourceFlow.DappConnection,
      'Mobile-dapp-connection',
    ],
    [RequestSourcePlatform.Mobile, RequestSourceFlow.Browser, 'Mobile-browser'],
    [
      RequestSourcePlatform.Mobile,
      RequestSourceFlow.RpcTrustSignals,
      'Mobile-rpc-trust-signals',
    ],
    [
      RequestSourcePlatform.Mobile,
      RequestSourceFlow.NftDetection,
      'Mobile-nft-detection',
    ],
  ];

  it.each(validCombinations)(
    'composes %s + %s into %s',
    (platform, flow, expected) => {
      expect(buildRequestSource(platform, flow)).toBe(expected);
    },
  );

  it('falls back to the platform sentinel when no flow is given', () => {
    expect(buildRequestSource(RequestSourcePlatform.Extension)).toBe(
      'Extension-unknown',
    );
    expect(buildRequestSource(RequestSourcePlatform.Mobile)).toBe(
      'Mobile-unknown',
    );
  });

  it('falls back to the platform sentinel when the flow is not recognised', () => {
    // Guards against a typo from an untyped (JavaScript) call site, which would
    // otherwise be reported as a real attribution value.
    expect(
      buildRequestSource(
        RequestSourcePlatform.Extension,
        'dapp-conection' as RequestSourceFlow,
      ),
    ).toBe('Extension-unknown');
  });

  it('returns the bare sentinel when no platform is configured', () => {
    expect(buildRequestSource()).toBe(UNKNOWN_REQUEST_SOURCE);
    expect(
      buildRequestSource(undefined, RequestSourceFlow.DappConnection),
    ).toBe(UNKNOWN_REQUEST_SOURCE);
  });

  it('returns the bare sentinel when the platform is not recognised', () => {
    expect(
      buildRequestSource(
        'Desktop' as RequestSourcePlatform,
        RequestSourceFlow.DappConnection,
      ),
    ).toBe(UNKNOWN_REQUEST_SOURCE);
  });

  it('never throws, so attribution cannot fail a scan', () => {
    expect(() =>
      buildRequestSource(
        null as unknown as RequestSourcePlatform,
        null as unknown as RequestSourceFlow,
      ),
    ).not.toThrow();
  });
});
