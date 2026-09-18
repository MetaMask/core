import { disableNetConnect, cleanAll, enableNetConnect } from 'nock';

beforeEach(() => {
  disableNetConnect();
});

afterEach(() => {
  cleanAll();
  enableNetConnect();
});
