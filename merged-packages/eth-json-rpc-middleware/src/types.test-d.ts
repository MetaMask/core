import type { AbstractRpcService } from '@metamask/network-controller';
import { expectAssignable } from 'tsd';

import type { AbstractRpcServiceLike } from './types';

// Confirm that the `AbstractRpcServiceLike` type in this repo is compatible
// with the type of the `request` method from `AbstractRpcService` in
// `@metamask/network-controller` (from where it was copied).
declare const networkControllerRpcService: AbstractRpcService;
expectAssignable<AbstractRpcServiceLike>(networkControllerRpcService);
