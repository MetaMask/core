import { server } from "./src/sdk/mocks/msw";

// establish API mocking
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());