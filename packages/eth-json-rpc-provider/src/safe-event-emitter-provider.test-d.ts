import { Web3Provider } from '@ethersproject/providers';
import EthQuery from '@metamask/eth-query';
import EthJsQuery from '@metamask/ethjs-query';
import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import { BrowserProvider } from 'ethers';

import { SafeEventEmitterProvider } from './safe-event-emitter-provider';

const engine = new JsonRpcEngine();
const provider = new SafeEventEmitterProvider({ engine });

// /* @metamask/eth-query */
new EthQuery(provider);

// /* @metamask/ethjs-query */
new EthJsQuery(provider);

// /* Ethers v5's Web3Provider */
new Web3Provider(provider);

// /* Ethers v6's BrowserProvider */
new BrowserProvider(provider);
