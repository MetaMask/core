import { JsonRpcEngine, createIdRemapMiddleware } from '.';

describe('idRemapMiddleware', () => {
  it('basic middleware test', async () => {
    const engine = new JsonRpcEngine();

    const observedIds: Record<string, Record<string, unknown>> = {
      before: {},
      after: {},
    };

    engine.push(function (req, res, next, _end) {
      observedIds.before.req = req.id;
      observedIds.before.res = res.id;
      next();
    });
    engine.push(createIdRemapMiddleware());
    engine.push(function (req, res, _next, end) {
      observedIds.after.req = req.id;
      observedIds.after.res = res.id;
      // set result so it doesnt error
      res.result = true;
      end();
    });

    const payload = { id: 1, jsonrpc: '2.0' as const, method: 'hello' };
    const payloadCopy = { ...payload };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, res) {
        expect(err).toBeNull();
        expect(res).toBeDefined();
        // collected data
        expect(observedIds.before.req).toBeDefined();
        expect(observedIds.before.res).toBeDefined();
        expect(observedIds.after.req).toBeDefined();
        expect(observedIds.after.res).toBeDefined();
        // data matches expectations
        expect(observedIds.before.req).toStrictEqual(observedIds.before.res);
        expect(observedIds.after.req).toStrictEqual(observedIds.after.res);
        // correct behavior
        expect(observedIds.before.req).not.toStrictEqual(observedIds.after.req);

        expect(observedIds.before.req).toStrictEqual(res.id);
        expect(payload.id).toStrictEqual(res.id);
        expect(payloadCopy.id).toStrictEqual(res.id);
        resolve();
      });
    });
  });
});
