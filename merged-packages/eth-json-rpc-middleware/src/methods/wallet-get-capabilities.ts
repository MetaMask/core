import { rpcErrors } from '@metamask/rpc-errors';
import type { Infer } from '@metamask/superstruct';
import { array, optional, tuple } from '@metamask/superstruct';
import type {
  Hex,
  Json,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from '@metamask/utils';
import { StrictHexStruct, HexChecksumAddressStruct } from '@metamask/utils';

import {
  validateAndNormalizeKeyholder,
  validateParams,
} from '../utils/validation';

const GetCapabilitiesStruct = tuple([
  HexChecksumAddressStruct,
  optional(array(StrictHexStruct)),
]);

export type GetCapabilitiesParams = Infer<typeof GetCapabilitiesStruct>;
export type GetCapabilitiesResult = Record<Hex, Record<string, Json>>;

export type GetCapabilitiesHook = (
  address: GetCapabilitiesParams[0],
  chainIds: GetCapabilitiesParams[1],
  req: JsonRpcRequest,
) => Promise<GetCapabilitiesResult>;

export async function walletGetCapabilities(
  req: JsonRpcRequest,
  res: PendingJsonRpcResponse<Json>,
  {
    getAccounts,
    getCapabilities,
  }: {
    getAccounts: (req: JsonRpcRequest) => Promise<string[]>;
    getCapabilities?: GetCapabilitiesHook;
  },
): Promise<void> {
  if (!getCapabilities) {
    throw rpcErrors.methodNotSupported();
  }

  validateParams(req.params, GetCapabilitiesStruct);

  const address = req.params[0];
  const chainIds = req.params[1];

  await validateAndNormalizeKeyholder(address, req, {
    getAccounts,
  });

  const capabilities = await getCapabilities(address, chainIds, req);

  res.result = capabilities;
}
