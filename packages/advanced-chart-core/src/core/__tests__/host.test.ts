import {
  _resetHostTransportForTests,
  getHostTransport,
  setHostTransport,
} from '../host.js';
import type { ChartHostTransport } from '../host.js';

const fakeHost = (): ChartHostTransport => ({
  postMessage: jest.fn(),
  subscribe: jest.fn(() => () => undefined),
  getConfig: jest.fn(() => undefined),
});

describe('core/host', () => {
  afterEach(() => {
    _resetHostTransportForTests();
    delete window.ReactNativeWebView;
    delete window.CONFIG;
  });

  it('defaults to the React Native adapter when none is injected', () => {
    const bridge = { postMessage: jest.fn() };
    window.ReactNativeWebView = bridge;
    getHostTransport().postMessage('payload');
    expect(bridge.postMessage).toHaveBeenCalledWith('payload');
  });

  it('returns the injected transport after setHostTransport', () => {
    const host = fakeHost();
    setHostTransport(host);
    expect(getHostTransport()).toBe(host);
  });

  it('re-defaults after _resetHostTransportForTests', () => {
    const host = fakeHost();
    setHostTransport(host);
    _resetHostTransportForTests();
    expect(getHostTransport()).not.toBe(host);
  });
});
