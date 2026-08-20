import nock from 'nock';

import {
  mapNeoBankAutorampToRemoteSnapshot,
  NeoBankService,
} from './NeoBankService.js';
import type { NeoBankServiceMessenger } from './NeoBankService.js';
import { RampsEnvironment } from './RampsService.js';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { MockAnyNamespace } from '@metamask/messenger';

describe('NeoBankService', () => {
  describe('mapNeoBankAutorampToRemoteSnapshot', () => {
    it('maps MoonPay-shaped fields into a remote snapshot', () => {
      expect(
        mapNeoBankAutorampToRemoteSnapshot({
          id: 'ar-1',
          customer_id: 'cust-1',
          status: 'Approved',
          wallet_address: '0xabc',
          deposit_rails: [{ type: 'Iban' }],
        }),
      ).toStrictEqual({
        id: 'ar-1',
        customerId: 'cust-1',
        walletAddress: '0xabc',
        status: 'Approved',
        depositRailsSummary: { ready: true },
      });
    });
  });

  describe('getAutoramp', () => {
    it('GETs the proxied autoramp endpoint with bearer auth', async () => {
      const rootMessenger = new Messenger({
        namespace: MOCK_ANY_NAMESPACE as MockAnyNamespace,
      });
      rootMessenger.registerActionHandler(
        'AuthenticationController:getBearerToken',
        async () => 'test-token',
      );

      const messenger = new Messenger({
        namespace: 'NeoBankService',
        parent: rootMessenger,
      }) as unknown as NeoBankServiceMessenger;
      rootMessenger.delegate({
        messenger,
        actions: ['AuthenticationController:getBearerToken'],
      });

      const scope = nock('https://on-ramp.uat-api.cx.metamask.io')
        .get(/\/api\/v2\/autoramps\/ar-1/u)
        .matchHeader('Authorization', 'Bearer test-token')
        .reply(200, {
          id: 'ar-1',
          customer_id: 'cust-1',
          status: 'Authorized',
          wallet_address: '0xabc',
        });

      const service = new NeoBankService({
        messenger,
        environment: RampsEnvironment.Staging,
        context: 'test',
        fetch: globalThis.fetch.bind(globalThis),
      });

      const snapshot = await service.getAutoramp('ar-1');

      expect(scope.isDone()).toBe(true);
      expect(snapshot).toMatchObject({
        id: 'ar-1',
        customerId: 'cust-1',
        status: 'Authorized',
        walletAddress: '0xabc',
      });
    });
  });
});
