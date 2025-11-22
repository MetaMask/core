/* eslint-disable import-x/no-named-as-default-member */
import nock from 'nock';

beforeEach(() => {
  nock.disableNetConnect();
});

afterEach(() => {
  // Clean up all nock interceptors and restore network connections
  nock.cleanAll();
  nock.enableNetConnect();
});
