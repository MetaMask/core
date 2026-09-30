import { describe, expect, it } from 'vitest';

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
      'extension-dapp-connection',
    ],
    [
      RequestSourcePlatform.Extension,
      RequestSourceFlow.RpcTrustSignals,
      'extension-rpc-trust-signals',
    ],
    [
      RequestSourcePlatform.Extension,
      RequestSourceFlow.Confirmations,
      'extension-confirmations',
    ],
    [
      RequestSourcePlatform.Extension,
      RequestSourceFlow.RevealSrp,
      'extension-reveal-srp',
    ],
    [
      RequestSourcePlatform.Extension,
      RequestSourceFlow.NftDetection,
      'extension-nft-detection',
    ],
    [
      RequestSourcePlatform.Mobile,
      RequestSourceFlow.DappConnection,
      'mobile-dapp-connection',
    ],
    [RequestSourcePlatform.Mobile, RequestSourceFlow.Browser, 'mobile-browser'],
    [
      RequestSourcePlatform.Mobile,
      RequestSourceFlow.RpcTrustSignals,
      'mobile-rpc-trust-signals',
    ],
    [
      RequestSourcePlatform.Mobile,
      RequestSourceFlow.NftDetection,
      'mobile-nft-detection',
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
      'extension-unknown',
    );
    expect(buildRequestSource(RequestSourcePlatform.Mobile)).toBe(
      'mobile-unknown',
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
    ).toBe('extension-unknown');
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
