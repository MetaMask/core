"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/create-network-client.ts
var _controllerutils = require('@metamask/controller-utils');
var _ethblocktracker = require('@metamask/eth-block-tracker');
var _ethjsonrpcinfura = require('@metamask/eth-json-rpc-infura');








var _ethjsonrpcmiddleware = require('@metamask/eth-json-rpc-middleware');



var _ethjsonrpcprovider = require('@metamask/eth-json-rpc-provider');





var _jsonrpcengine = require('@metamask/json-rpc-engine');
var SECOND = 1e3;
function createNetworkClient(networkConfig) {
  const rpcApiMiddleware = networkConfig.type === "infura" /* Infura */ ? _ethjsonrpcinfura.createInfuraMiddleware.call(void 0, {
    network: networkConfig.network,
    projectId: networkConfig.infuraProjectId,
    maxAttempts: 5,
    source: "metamask"
  }) : _ethjsonrpcmiddleware.createFetchMiddleware.call(void 0, {
    btoa: global.btoa,
    fetch: global.fetch,
    rpcUrl: networkConfig.rpcUrl
  });
  const rpcProvider = _ethjsonrpcprovider.providerFromMiddleware.call(void 0, rpcApiMiddleware);
  const blockTrackerOpts = (
    // eslint-disable-next-line n/no-process-env
    process.env.IN_TEST && networkConfig.type === "custom" ? { pollingInterval: SECOND } : {}
  );
  const blockTracker = new (0, _ethblocktracker.PollingBlockTracker)({
    ...blockTrackerOpts,
    provider: rpcProvider
  });
  const networkMiddleware = networkConfig.type === "infura" /* Infura */ ? createInfuraNetworkMiddleware({
    blockTracker,
    network: networkConfig.network,
    rpcProvider,
    rpcApiMiddleware
  }) : createCustomNetworkMiddleware({
    blockTracker,
    chainId: networkConfig.chainId,
    rpcApiMiddleware
  });
  const engine = new (0, _jsonrpcengine.JsonRpcEngine)();
  engine.push(networkMiddleware);
  const provider = _ethjsonrpcprovider.providerFromEngine.call(void 0, engine);
  const destroy = () => {
    blockTracker.destroy();
  };
  return { configuration: networkConfig, provider, blockTracker, destroy };
}
function createInfuraNetworkMiddleware({
  blockTracker,
  network,
  rpcProvider,
  rpcApiMiddleware
}) {
  return _jsonrpcengine.mergeMiddleware.call(void 0, [
    createNetworkAndChainIdMiddleware({ network }),
    _ethjsonrpcmiddleware.createBlockCacheMiddleware.call(void 0, { blockTracker }),
    _ethjsonrpcmiddleware.createInflightCacheMiddleware.call(void 0, ),
    _ethjsonrpcmiddleware.createBlockRefMiddleware.call(void 0, { blockTracker, provider: rpcProvider }),
    _ethjsonrpcmiddleware.createRetryOnEmptyMiddleware.call(void 0, { blockTracker, provider: rpcProvider }),
    _ethjsonrpcmiddleware.createBlockTrackerInspectorMiddleware.call(void 0, { blockTracker }),
    rpcApiMiddleware
  ]);
}
function createNetworkAndChainIdMiddleware({
  network
}) {
  return _jsonrpcengine.createScaffoldMiddleware.call(void 0, {
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    eth_chainId: _controllerutils.ChainId[network]
  });
}
var createChainIdMiddleware = (chainId) => {
  return (req, res, next, end) => {
    if (req.method === "eth_chainId") {
      res.result = chainId;
      return end();
    }
    return next();
  };
};
function createCustomNetworkMiddleware({
  blockTracker,
  chainId,
  rpcApiMiddleware
}) {
  const testMiddlewares = process.env.IN_TEST ? [createEstimateGasDelayTestMiddleware()] : [];
  return _jsonrpcengine.mergeMiddleware.call(void 0, [
    ...testMiddlewares,
    createChainIdMiddleware(chainId),
    _ethjsonrpcmiddleware.createBlockRefRewriteMiddleware.call(void 0, { blockTracker }),
    _ethjsonrpcmiddleware.createBlockCacheMiddleware.call(void 0, { blockTracker }),
    _ethjsonrpcmiddleware.createInflightCacheMiddleware.call(void 0, ),
    _ethjsonrpcmiddleware.createBlockTrackerInspectorMiddleware.call(void 0, { blockTracker }),
    rpcApiMiddleware
  ]);
}
function createEstimateGasDelayTestMiddleware() {
  return _jsonrpcengine.createAsyncMiddleware.call(void 0, async (req, _, next) => {
    if (req.method === "eth_estimateGas") {
      await new Promise((resolve) => setTimeout(resolve, SECOND * 2));
    }
    return next();
  });
}



exports.createNetworkClient = createNetworkClient;
//# sourceMappingURL=chunk-E4V6XEBR.js.map