import { PollingBlockTracker } from 'eth-block-tracker';
import { JsonRpcMiddleware } from 'json-rpc-engine';

export type CreateClientResult = {
  networkMiddleware: JsonRpcMiddleware<any, any>;
  blockTracker: PollingBlockTracker;
};
