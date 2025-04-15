import { providerErrors, rpcErrors } from '@metamask/rpc-errors';
import type { Struct, StructError } from '@metamask/superstruct';
import { validate } from '@metamask/superstruct';
import type { Hex, JsonRpcRequest } from '@metamask/utils';

export async function validateAndNormalizeKeyholder(
  address: Hex,
  req: JsonRpcRequest,
  { getAccounts }: { getAccounts: (req: JsonRpcRequest) => Promise<string[]> },
): Promise<Hex> {
  if (
    typeof address === 'string' &&
    address.length > 0 &&
    resemblesAddress(address)
  ) {
    // Ensure that an "unauthorized" error is thrown if the requester
    // does not have the `eth_accounts` permission.
    const accounts = await getAccounts(req);

    const normalizedAccounts: string[] = accounts.map((_address) =>
      _address.toLowerCase(),
    );

    const normalizedAddress = address.toLowerCase() as Hex;

    if (normalizedAccounts.includes(normalizedAddress)) {
      return normalizedAddress;
    }

    throw providerErrors.unauthorized();
  }

  throw rpcErrors.invalidParams({
    message: `Invalid parameters: must provide an Ethereum address.`,
  });
}

export function validateParams<ParamsType>(
  value: unknown | ParamsType,
  struct: Struct<ParamsType>,
): asserts value is ParamsType {
  const [error] = validate(value, struct);

  if (error) {
    throw rpcErrors.invalidParams(
      formatValidationError(error, `Invalid params`),
    );
  }
}

export function resemblesAddress(str: string): boolean {
  // hex prefix 2 + 20 bytes
  return str.length === 2 + 20 * 2;
}

function formatValidationError(error: StructError, message: string): string {
  return `${message}\n\n${error
    .failures()
    .map(
      (f) => `${f.path.join(' > ')}${f.path.length ? ' - ' : ''}${f.message}`,
    )
    .join('\n')}`;
}
