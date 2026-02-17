// nock v14 uses @mswjs/interceptors which creates Response objects internally.
// When Response.json() parses the body, the resulting objects may have a
// different Object.prototype than the test context (cross-realm issue with
// VM contexts used by msw interceptors). Override json() to re-parse
// through the current context's JSON.parse, ensuring prototype consistency
// for assertions like toStrictEqual.
if (typeof Response !== 'undefined') {
  Response.prototype.json = async function () {
    const text = await this.text();
    return JSON.parse(text);
  };
}

// nock v14's @mswjs/interceptors uses a MockHttpSocket that doesn't properly
// terminate HTTP response streams when Connection: keep-alive is set. xhr2
// (used by @metamask/ethjs-provider-http) sets keep-alive by default, causing
// response bodies to never complete. Patch xhr2 to use Connection: close so
// the mock socket correctly signals end-of-response.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XHR2 = require('xhr2');
  const originalFinalizeHeaders = XHR2.prototype._finalizeHeaders;
  XHR2.prototype._finalizeHeaders = function () {
    originalFinalizeHeaders.call(this);
    this._headers['Connection'] = 'close';
  };
} catch {
  // xhr2 not available in this package — no patch needed
}
