import {
  loadTradingViewLibrary,
  _resetLoadLibraryForTests,
} from '../loadLibrary.js';
import { _resetStateForTests } from '../state.js';

type ScriptStub = {
  type?: string;
  src?: string;
  onload?: () => void;
  onerror?: () => void;
};

describe('core/loadLibrary', () => {
  let script: ScriptStub;
  let appendSpy: jest.SpyInstance;

  beforeEach(() => {
    _resetStateForTests();
    _resetLoadLibraryForTests();
    delete window.ReactNativeWebView;
    script = {};
    const createElementImpl = (tag: string): HTMLElement => {
      if (tag === 'script') {
        return script as unknown as HTMLScriptElement;
      }
      return {} as HTMLElement;
    };
    jest
      .spyOn(document, 'createElement')
      .mockImplementation(createElementImpl as never);
    appendSpy = jest
      .spyOn(document.head, 'appendChild')
      .mockImplementation(((node: Node) => node) as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('appends the charting_library.js script with the correct URL', async () => {
    const promise = loadTradingViewLibrary('https://cdn.example.com/');
    expect(script.src).toBe('https://cdn.example.com/charting_library.js');
    expect(appendSpy).toHaveBeenCalledTimes(1);

    script.onload?.();
    expect(await promise).toBeUndefined();
  });

  it('rejects when the script onerror fires', async () => {
    const promise = loadTradingViewLibrary('https://cdn.example.com/');
    script.onerror?.();
    await expect(promise).rejects.toThrow(
      /Failed to load TradingView library/u,
    );
  });

  it('resolves immediately on subsequent calls once loaded', async () => {
    const first = loadTradingViewLibrary('https://cdn.example.com/');
    script.onload?.();
    await first;

    // Reset spies to confirm no second script tag is appended.
    appendSpy.mockClear();
    await loadTradingViewLibrary('https://cdn.example.com/');
    expect(appendSpy).not.toHaveBeenCalled();
  });

  it('second call before onload only appends once', async () => {
    const first = loadTradingViewLibrary('https://cdn.example.com/');
    const second = loadTradingViewLibrary('https://cdn.example.com/');

    expect(appendSpy).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);

    script.onload?.();
    await first;
    await second;
  });

  it('rejects subsequent calls if the prior load errored', async () => {
    const first = loadTradingViewLibrary('https://cdn.example.com/');
    script.onerror?.();
    await expect(first).rejects.toThrow(/Failed to load TradingView library/u);

    await expect(
      loadTradingViewLibrary('https://cdn.example.com/'),
    ).rejects.toThrow(/Failed to load TradingView library/u);
  });
});
