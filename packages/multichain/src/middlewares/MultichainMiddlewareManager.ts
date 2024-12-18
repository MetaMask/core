import type {
  JsonRpcEngineEndCallback,
  JsonRpcEngineNextCallback,
} from '@metamask/json-rpc-engine';
import type {
  Json,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from '@metamask/utils';

import type { ExternalScopeString } from '../scope/types';

export type ExtendedJsonRpcMiddleware = {
  (
    req: JsonRpcRequest & { scope: string },
    res: PendingJsonRpcResponse<Json>,
    next: JsonRpcEngineNextCallback,
    end: JsonRpcEngineEndCallback,
  ): void;
  destroy?: () => void | Promise<void>;
};

type MiddlewareKey = {
  scope: ExternalScopeString;
  origin: string;
  tabId?: number;
};
type MiddlewareEntry = MiddlewareKey & {
  middleware: ExtendedJsonRpcMiddleware;
};

/**
 * A helper that facilates registering and calling of provided middleware instances
 * in the RPC pipeline based on the incoming request's scope, origin, and tabId.
 * Note that only one middleware instance can be registered per scope, origin, tabId key.
 */
export class MultichainMiddlewareManager {
  #middlewares: MiddlewareEntry[] = [];

  #getMiddlewareEntry({
    scope,
    origin,
    tabId,
  }: MiddlewareKey): MiddlewareEntry | undefined {
    return this.#middlewares.find((middlewareEntry) => {
      return (
        middlewareEntry.scope === scope &&
        middlewareEntry.origin === origin &&
        middlewareEntry.tabId === tabId
      );
    });
  }

  #removeMiddlewareEntry({ scope, origin, tabId }: MiddlewareEntry) {
    this.#middlewares = this.#middlewares.filter((middlewareEntry) => {
      return (
        middlewareEntry.scope !== scope ||
        middlewareEntry.origin !== origin ||
        middlewareEntry.tabId !== tabId
      );
    });
  }

  addMiddleware(middlewareEntry: MiddlewareEntry) {
    const { scope, origin, tabId } = middlewareEntry;
    if (!this.#getMiddlewareEntry({ scope, origin, tabId })) {
      this.#middlewares.push(middlewareEntry);
    }
  }

  #removeMiddleware(middlewareEntry: MiddlewareEntry) {
    // When the destroy function on the middleware is async,
    // we don't need to wait for it complete
    Promise.resolve(middlewareEntry.middleware.destroy?.()).catch(() => {
      // do nothing
    });

    this.#removeMiddlewareEntry(middlewareEntry);
  }

  removeMiddlewareByScope(scope: ExternalScopeString) {
    this.#middlewares.forEach((middlewareEntry) => {
      if (middlewareEntry.scope === scope) {
        this.#removeMiddleware(middlewareEntry);
      }
    });
  }

  removeMiddlewareByScopeAndOrigin(scope: ExternalScopeString, origin: string) {
    this.#middlewares.forEach((middlewareEntry) => {
      if (
        middlewareEntry.scope === scope &&
        middlewareEntry.origin === origin
      ) {
        this.#removeMiddleware(middlewareEntry);
      }
    });
  }

  removeMiddlewareByOriginAndTabId(origin: string, tabId?: number) {
    this.#middlewares.forEach((middlewareEntry) => {
      if (
        middlewareEntry.origin === origin &&
        middlewareEntry.tabId === tabId
      ) {
        this.#removeMiddleware(middlewareEntry);
      }
    });
  }

  generateMultichainMiddlewareForOriginAndTabId(
    origin: string,
    tabId?: number,
  ) {
    const middleware: ExtendedJsonRpcMiddleware = (req, res, next, end) => {
      const { scope } = req;
      const middlewareEntry = this.#getMiddlewareEntry({
        scope,
        origin,
        tabId,
      });

      if (middlewareEntry) {
        middlewareEntry.middleware(req, res, next, end);
      } else {
        return next();
      }
      return undefined;
    };
    middleware.destroy = this.removeMiddlewareByOriginAndTabId.bind(
      this,
      origin,
      tabId,
    );

    return middleware;
  }
}
