import { setupServer } from "msw/node";
import { handleMockNonce, handleMockSiweLogin, handleMockSrpLogin } from "./mock-auth";

// establish API mocking
export const server = setupServer(handleMockNonce(), handleMockSiweLogin(), handleMockSrpLogin());
