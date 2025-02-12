import type { AbstractRpcService as NetworkControllerAbstractRpcService } from '@metamask/network-controller';
import { expectAssignable } from 'tsd';

import type { AbstractRpcService as LocalAbstractRpcService } from './types';

// Confirm that the AbstractRpcService in this repo is compatible with the same
// one in `@metamask/network-controller` (from where it was copied)
declare const rpcService: LocalAbstractRpcService;
expectAssignable<NetworkControllerAbstractRpcService>(rpcService);
