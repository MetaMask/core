import path from 'path';
import { setupPolly } from 'setup-polly-jest';
import NodeHttpAdapter from '@pollyjs/adapter-node-http';
import FSPersister from '@pollyjs/persister-fs';

global.pollyContext = setupPolly({
  adapters: [NodeHttpAdapter],
  persister: FSPersister,
  persisterOptions: {
    fs: {
      recordingsDir: path.resolve(__dirname, '__recordings__'),
    },
  },
  recordIfMissing: false,
  recordFailedRequests: true,
});
