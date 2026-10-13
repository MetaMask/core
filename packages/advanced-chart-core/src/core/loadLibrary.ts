// Loads the TradingView Advanced Charts library from window.CONFIG.libraryUrl
// by injecting a <script> tag into the document head.
//
// Mirrors legacy chartLogic.js `loadLibrary()` (lines ~5211-5237) but returns
// a Promise so callers can `await` library readiness in bootstrap.ts.

import { reportErrorToRN } from './bridge.js';
import {
  setLibraryLoaded,
  setLibraryError,
  isLibraryLoaded,
  getLibraryError,
} from './state.js';

const CHARTING_LIBRARY_FILE = 'charting_library.js';

let inflightPromise: Promise<void> | null = null;

/**
 * Loads the TradingView library script. Subsequent calls resolve immediately
 * if the library is already loaded; rejected if a previous load failed.
 * Concurrent calls while the script is still loading share the same promise.
 *
 * @param libraryUrl - Base URL that the `charting_library.js` file is appended to.
 * @returns A promise that resolves once the library script has loaded.
 */
export function loadTradingViewLibrary(libraryUrl: string): Promise<void> {
  if (isLibraryLoaded()) {
    return Promise.resolve();
  }
  const existingError = getLibraryError();
  if (existingError) {
    return Promise.reject(new Error(existingError));
  }
  if (inflightPromise) {
    return inflightPromise;
  }

  inflightPromise = new Promise<void>((resolve, reject) => {
    const scriptUrl = libraryUrl + CHARTING_LIBRARY_FILE;
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = scriptUrl;
    script.onload = (): void => {
      setLibraryLoaded(true);
      inflightPromise = null;
      resolve();
    };
    script.onerror = (): void => {
      const message = `Failed to load TradingView library. URL: ${scriptUrl}`;
      setLibraryError(message);
      inflightPromise = null;
      reportErrorToRN(message);
      reject(new Error(message));
    };
    document.head.appendChild(script);
  });
  return inflightPromise;
}

/**
 * Resets the cached in-flight library-load promise.
 *
 * @internal
 */
export function _resetLoadLibraryForTests(): void {
  inflightPromise = null;
}
