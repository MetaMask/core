const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const HEX_STRING_REGEX = /^0x[0-9a-fA-F]+$/u;
const DECIMAL_STRING_REGEX = /^[0-9]+$/u;

// Cap the number of addresses returned for a single signature. A legitimate
// signature references far fewer; exceeding this is treated as unusual and
// surfaced to the caller (via `overflow`) rather than scanned in full.
const MAX_SIGNATURE_ADDRESSES = 10;

// Limit recursion depth when walking nested types.
const MAX_TRAVERSAL_DEPTH = 12;

// Limit total nodes walked so a large or highly-repetitive payload cannot stall
// traversal, independent of how many distinct addresses are found.
const MAX_TRAVERSAL_NODES = 5000;

type Eip712Field = { name: string; type: string };
type Eip712Types = Record<string, Eip712Field[]>;

/**
 * The result of walking an EIP-712 typed-data message for `address`-typed
 * values.
 */
export type ExtractedSignatureAddresses = {
  /**
   * Distinct canonical addresses to scan, capped at `MAX_SIGNATURE_ADDRESSES`.
   */
  addresses: string[];
  /**
   * Canonical address -> the field name it was first found under, so a caller
   * can name the specific field in an alert.
   */
  fields: Record<string, string>;
  /**
   * True when the message could not be fully walked: more distinct addresses
   * than the cap, traversal stopped by the depth or work budget, or an
   * address-bearing type could not be walked (array type with a non-array
   * value, or struct type with a non-object value). Some addresses may be
   * unscanned, so the caller should surface a caution.
   */
  overflow: boolean;
};

/**
 * Options for {@link extractSignatureAddresses}.
 */
export type ExtractSignatureAddressesOptions = {
  /**
   * Addresses to skip (e.g. the signer). The zero address is always excluded.
   */
  exclude?: string[];
  /**
   * Top-level field names to skip, used to avoid a duplicate scan/alert for a
   * field already handled elsewhere (e.g. permit `spender`). Names must match
   * the declared EIP-712 field exactly. Only applied to the primary type
   * (depth 0), not nested structs.
   */
  excludeFields?: string[];
};

/**
 * Encode a non-negative integer as big-endian hex (even length) and take the
 * leading 20 bytes.
 *
 * @param numeric - A non-negative integer.
 * @returns Canonical lower-case 20-byte address.
 */
function leadingTwentyBytesFromInteger(numeric: bigint): string {
  let digits = numeric.toString(16);
  if (digits.length % 2 === 1) {
    digits = `0${digits}`;
  }
  return `0x${digits.slice(0, 40).padStart(40, '0')}`;
}

/**
 * Reduce an `address`-typed value to canonical 20-byte hex.
 *
 * The signer accepts more than canonical hex for an `address` field (hex of any
 * length, or a decimal string) and takes the high / leading 20 bytes of the
 * big-endian encoding (`reallyStrangeAddressToBytes(value).subarray(0, 20)` /
 * `hexToBytes(value).subarray(0, 20)` in `@metamask/eth-sig-util`), so matching
 * only `0x` + 40 hex would miss an address encoded in another form.
 *
 * @param value - The raw field value from the message.
 * @returns Canonical lower-case address, or undefined if not address-like.
 */
function normalizeAddress(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (HEX_STRING_REGEX.test(trimmed)) {
      let digits = trimmed.slice(2);
      if (digits.length % 2 === 1) {
        digits = `0${digits}`;
      }
      return `0x${digits.slice(0, 40).padStart(40, '0').toLowerCase()}`;
    }
    if (DECIMAL_STRING_REGEX.test(trimmed)) {
      return leadingTwentyBytesFromInteger(BigInt(trimmed));
    }
    return undefined;
  }

  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return leadingTwentyBytesFromInteger(BigInt(value));
  }

  return undefined;
}

/**
 * Collect every `address`-typed value in an EIP-712 message.
 *
 * Walks the `types` schema from `primaryType` and returns the value of each
 * field declared as `address` or `address[]`, recursing into nested structs and
 * arrays. Matching on the declared type rather than the field name means custom
 * and unknown message shapes are covered without per-protocol handling.
 *
 * Type dispatch matches the signer: a custom struct in `types` is walked first
 * (even if its name looks like `address` or `address[]`), then `address`, then
 * types whose name ends in `]` as arrays.
 *
 * `domain` is not traversed; its `verifyingContract` is expected to be scanned
 * separately by the caller.
 *
 * @param typedData - Parsed EIP-712 payload (`types`, `primaryType`, `message`).
 * @param options - Optional configuration.
 * @param options.exclude - Addresses to skip (e.g. the signer). The zero
 * address is always excluded.
 * @param options.excludeFields - Top-level field names to skip. Names must
 * match the declared EIP-712 field exactly. Only applied to the primary type
 * (depth 0), not nested structs.
 * @returns Up to `MAX_SIGNATURE_ADDRESSES` distinct canonical addresses, the
 * field each was found under, and whether the message could not be fully walked
 * (address cap, depth limit, work budget, or an unwalkable address-bearing
 * value).
 */
export function extractSignatureAddresses(
  typedData:
    | { types?: unknown; primaryType?: unknown; message?: unknown }
    | null
    | undefined,
  options: ExtractSignatureAddressesOptions = {},
): ExtractedSignatureAddresses {
  const types = typedData?.types as Eip712Types | undefined;
  const primaryType = typedData?.primaryType as string | undefined;
  const { message } = typedData ?? {};

  if (
    !types ||
    typeof types !== 'object' ||
    !primaryType ||
    !Array.isArray(types[primaryType]) ||
    !message ||
    typeof message !== 'object'
  ) {
    return { addresses: [], fields: {}, overflow: false };
  }

  // Narrowed alias so the hoisted helpers below see a defined `types`.
  const schema = types;

  // ZERO_ADDRESS is already canonical (lower-case, 20 bytes), so it is added
  // directly rather than round-tripped through `normalizeAddress`.
  const excluded = new Set<string>([ZERO_ADDRESS]);
  for (const address of options.exclude ?? []) {
    const normalized = normalizeAddress(address);
    if (normalized) {
      excluded.add(normalized);
    }
  }

  const excludedFields = new Set(options.excludeFields ?? []);

  // Canonical address -> the field name it was first found under.
  const found = new Map<string, string>();

  // Set when the message could not be fully walked, so some addresses may be
  // unscanned: the address cap, the depth limit, the work budget, or an
  // address-bearing type whose value could not be walked.
  let overflow = false;

  // Total nodes walked, bounded by MAX_TRAVERSAL_NODES.
  let visited = 0;

  // Stopping the walk (depth or work budget) leaves later fields unscanned, so
  // it is treated as overflow the same way the distinct-address cap is.
  const truncated = (depth: number): boolean => {
    if (depth > MAX_TRAVERSAL_DEPTH || visited >= MAX_TRAVERSAL_NODES) {
      overflow = true;
      return true;
    }
    return false;
  };

  /**
   * Whether `type` can contain `address` values: the `address` primitive, an
   * array of an address-bearing type, or a custom struct that contains one.
   *
   * @param type - The declared EIP-712 type.
   * @param seen - Types already inspected, to break recursive structs.
   * @returns True when walking this type can yield addresses.
   */
  function isAddressBearing(
    type: string,
    seen: Set<string> = new Set(),
  ): boolean {
    if (seen.has(type)) {
      return false;
    }
    seen.add(type);

    const structFields = schema[type];
    if (Array.isArray(structFields)) {
      return structFields.some(
        (field) =>
          Boolean(field) &&
          typeof field.type === 'string' &&
          isAddressBearing(field.type, seen),
      );
    }

    if (type === 'address') {
      return true;
    }

    if (type.endsWith(']')) {
      return isAddressBearing(type.slice(0, type.lastIndexOf('[')), seen);
    }

    return false;
  }

  /**
   * Record a candidate address value under a field name, applying exclusions,
   * de-duplication, and the distinct-address cap.
   *
   * @param field - The field name the value was found under.
   * @param value - The raw field value to normalize and collect.
   */
  function collect(field: string, value: unknown): void {
    const address = normalizeAddress(value);
    if (!address || excluded.has(address) || found.has(address)) {
      return;
    }
    if (found.size >= MAX_SIGNATURE_ADDRESSES) {
      overflow = true;
      return;
    }
    found.set(address, field);
  }

  /**
   * Walk the fields of a struct type, recursing per field.
   *
   * @param structName - The name of the struct type in the schema.
   * @param value - The message object corresponding to the struct.
   * @param depth - The current traversal depth.
   */
  function visitStruct(
    structName: string,
    value: unknown,
    depth: number,
  ): void {
    if (truncated(depth)) {
      return;
    }
    const structFields = schema[structName];
    if (!Array.isArray(structFields) || !value || typeof value !== 'object') {
      if (Array.isArray(structFields) && isAddressBearing(structName)) {
        overflow = true;
      }
      return;
    }
    for (const field of structFields) {
      if (truncated(depth)) {
        return;
      }
      if (
        !field ||
        typeof field.name !== 'string' ||
        typeof field.type !== 'string' ||
        // Field exclusions only apply to the primary type (depth 0), matching
        // the top-level field a dedicated caller already covers. Names must
        // match the declared EIP-712 field exactly.
        (depth === 0 && excludedFields.has(field.name))
      ) {
        continue;
      }
      visitField(
        field.name,
        field.type,
        (value as Record<string, unknown>)[field.name],
        depth,
      );
    }
  }

  /**
   * Walk a single field value, handling custom structs, `address`, and arrays.
   *
   * Precedence matches `@metamask/eth-sig-util` `encodeField`: a type present
   * in the schema is a struct first; otherwise `address`; otherwise a name
   * ending in `]` is treated as an array (`type.slice(0, lastIndexOf('['))`).
   *
   * @param field - The field name.
   * @param type - The declared EIP-712 type of the field.
   * @param value - The field value from the message.
   * @param depth - The current traversal depth.
   */
  function visitField(
    field: string,
    type: string,
    value: unknown,
    depth: number,
  ): void {
    visited += 1;
    if (truncated(depth)) {
      return;
    }

    if (Array.isArray(schema[type])) {
      visitStruct(type, value, depth + 1);
      return;
    }

    if (type === 'address') {
      collect(field, value);
      return;
    }

    if (type.endsWith(']')) {
      if (Array.isArray(value)) {
        const innerType = type.slice(0, type.lastIndexOf('['));
        for (const item of value) {
          if (truncated(depth)) {
            return;
          }
          visitField(field, innerType, item, depth + 1);
        }
      } else if (isAddressBearing(type)) {
        overflow = true;
      }
    }
  }

  visitStruct(primaryType, message, 0);

  return {
    addresses: Array.from(found.keys()),
    fields: Object.fromEntries(found),
    overflow,
  };
}
