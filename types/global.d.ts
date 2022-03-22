import { setupPolly } from 'setup-polly-jest';

declare global {
  /* eslint-disable-next-line @typescript-eslint/no-namespace */
  namespace NodeJS {
    interface Global {
      pollyContext: ReturnType<typeof setupPolly>;
    }
  }
}
