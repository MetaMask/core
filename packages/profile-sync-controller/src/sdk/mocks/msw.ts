import { setupServer } from "msw/node";
import type { HttpResponseResolver } from "msw";
import type { ResponseResolverInfo } from "msw/lib/core/handlers/RequestHandler";
import { handleMockNonce, handleMockSiweLogin, handleMockSrpLogin } from "./mock-auth";
import { handleMockUserStorageGet, handleMockUserStoragePut } from "./mock-userstorage";

export type InterceptParams = {
    /** inspect allows testers to see inside a mock handler but continue exection */
    inspect?: (ctx: ResponseResolverInfo<Record<string, unknown>>) => void | Promise<void>;
    
    /** callback allows testers to replace the logic and response of handler */
    callback?: HttpResponseResolver;
  };

// establish API mocking
export const server = setupServer(
    handleMockNonce(), 
    handleMockSiweLogin(), 
    handleMockSrpLogin(),
    handleMockUserStorageGet(),
    handleMockUserStoragePut(),
);
