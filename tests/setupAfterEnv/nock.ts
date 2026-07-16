// Types for `nock` are wrong.
/* eslint-disable import-x/no-named-as-default-member */

import nock from 'nock';

beforeEach(() => {
  nock.disableNetConnect();
});

afterEach(() => {
  nock.cleanAll();
  nock.enableNetConnect();
});
