import * as allExports from '.';

describe('@metamask/rate-limit-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
Array [
  "RateLimitedApi",
  "RateLimitedApiMap",
  "RateLimitedRequests",
  "RateLimitControllerActions",
  "RateLimitControllerCallApiAction",
  "RateLimitControllerGetStateAction",
  "RateLimitControllerEvents",
  "RateLimitControllerStateChangeEvent",
  "RateLimitMessenger",
  "RateLimitState",
  "RateLimitController",
]
`);
  });
});
