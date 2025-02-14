import { rpcErrors } from '@metamask/rpc-errors';
import type { Infer } from '@metamask/superstruct';
import { tuple } from '@metamask/superstruct';
import type {
  Hex,
  Json,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from '@metamask/utils';
import { HexChecksumAddressStruct } from '@metamask/utils';

import { validateParams } from '../utils/validation';

const GetCapabilitiesStruct = tuple([HexChecksumAddressStruct]);

export type GetCapabilitiesParams = Infer<typeof GetCapabilitiesStruct>;
export type GetCapabilitiesResult = Record<Hex, Record<string, Json>>;

export type GetCapabilitiesHook = (
  address: Hex,
  req: JsonRpcRequest,
) => Promise<GetCapabilitiesResult>;

export async function walletGetCapabilities(
  req: JsonRpcRequest,
  res: PendingJsonRpcResponse<Json>,
  {
    getCapabilities,
  }: {
    getCapabilities?: GetCapabilitiesHook;
  },
): Promise<void> {
  if (!getCapabilities) {
    throw rpcErrors.methodNotSupported();
  }

  validateParams(req.params, GetCapabilitiesStruct);

  const address = req.params[0];
  const capabilities = await getCapabilities(address, req);

  res.result = capabilities;
}
