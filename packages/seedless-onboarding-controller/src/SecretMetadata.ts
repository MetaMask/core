import type {
  EncAccountDataType,
  SecretDataItemOutput,
} from '@metamask/toprf-secure-backup';
import {
  base64ToBytes,
  bytesToBase64,
  stringToBytes,
  bytesToString,
} from '@metamask/utils';

import {
  SeedlessOnboardingControllerErrorMessage,
  SecretType,
} from './constants';
import type { SecretDataType } from './types';
import { getSecretTypeFromDataType } from './utils';

type ISecretMetadata<DataType extends SecretDataType = Uint8Array> = {
  data: DataType;
  timestamp: number;
  type: SecretType;
  toBytes: () => Uint8Array;
};

/**
 * SecretMetadata type without the data and toBytes methods
 * in which the data is base64 encoded for more compacted metadata
 */
type SecretMetadataJson<DataType extends SecretDataType> = Omit<
  ISecretMetadata<DataType>,
  'data' | 'toBytes'
> & {
  data: string; // base64 encoded string
};

/**
 * SecretMetadata is a class that adds metadata to the secret.
 *
 * It contains the secret and the timestamp when it was created.
 * It is used to store the secret in the metadata store.
 *
 * @example
 * ```ts
 * const secretMetadata = new SecretMetadata(secret);
 * ```
 */

/**
 * Options for SecretMetadata constructor.
 *
 * New clients: provide V2 fields (`dataType`, `createdAt`, etc).
 * Reading V1 data: `timestamp` and `type` come from encrypted JSON.
 */
type SecretMetadataOptions = {
  // V1 fields (from encrypted JSON payload, for backward compat)
  timestamp?: number;
  type?: SecretType;

  // Storage-level metadata from the metadata store (not encrypted).
  itemId?: string;
  dataType?: EncAccountDataType;
  createdAt?: string;
  /**
   * The storage-level version from the SDK ('v1' or 'v2').
   * - 'v1': Legacy items created before dataType was introduced
   * - 'v2': Items with dataType set (either new or migrated)
   */
  storageVersion?: SecretDataItemOutput['version'];
};

export class SecretMetadata<DataType extends SecretDataType = Uint8Array>
  implements ISecretMetadata<DataType>
{
  readonly #data: DataType;

  readonly #timestamp: number;

  readonly #type: SecretType;

  // Storage-level metadata (not encrypted)
  readonly #itemId?: string;

  readonly #dataType?: EncAccountDataType;

  readonly #createdAt?: string;

  readonly #storageVersion?: SecretDataItemOutput['version'];

  /**
   * @param data - The secret data.
   * @param options - Optional metadata. New clients should provide `dataType`.
   */
  constructor(data: DataType, options?: SecretMetadataOptions) {
    this.#data = data;
    this.#timestamp = options?.timestamp ?? Date.now();
    this.#itemId = options?.itemId;
    this.#dataType = options?.dataType;
    this.#createdAt = options?.createdAt;
    this.#storageVersion = options?.storageVersion;

    // Derive type from dataType (new clients), or use provided type (V1 compat)
    if (options?.dataType === undefined) {
      this.#type = options?.type ?? SecretType.Mnemonic;
    } else {
      this.#type = getSecretTypeFromDataType(options.dataType);
    }
  }

  /**
   * Assert that the provided value is a valid seed phrase metadata.
   *
   * @param value - The value to check.
   * @throws If the value is not a valid seed phrase metadata.
   */
  static assertIsValidSecretMetadataJson<
    DataType extends SecretDataType = Uint8Array,
  >(value: unknown): asserts value is SecretMetadataJson<DataType> {
    if (
      typeof value !== 'object' ||
      !value ||
      !('data' in value) ||
      typeof value.data !== 'string' ||
      !('timestamp' in value) ||
      typeof value.timestamp !== 'number'
    ) {
      throw new Error(
        SeedlessOnboardingControllerErrorMessage.InvalidSecretMetadata,
      );
    }
  }

  /**
   * Parse and create the SecretMetadata instance from the raw metadata bytes.
   *
   * @param rawMetadata - The raw metadata.
   * @param storageMetadata - Storage-level metadata from the metadata store.
   * @returns The parsed secret metadata.
   */
  static fromRawMetadata<DataType extends SecretDataType>(
    rawMetadata: Uint8Array,
    storageMetadata: Omit<SecretMetadataOptions, 'timestamp' | 'type'>,
  ): SecretMetadata<DataType> {
    const serializedMetadata = bytesToString(rawMetadata);
    const parsedMetadata = JSON.parse(serializedMetadata);

    SecretMetadata.assertIsValidSecretMetadataJson<DataType>(parsedMetadata);

    const type = parsedMetadata.type ?? SecretType.Mnemonic;

    let data: DataType;
    try {
      data = base64ToBytes(parsedMetadata.data) as DataType;
    } catch {
      data = parsedMetadata.data as DataType;
    }

    return new SecretMetadata<DataType>(data, {
      timestamp: parsedMetadata.timestamp,
      type,
      ...storageMetadata,
    });
  }

  /**
   * Compare two SecretMetadata instances by timestamp.
   *
   * @param a - The first SecretMetadata instance.
   * @param b - The second SecretMetadata instance.
   * @param order - The sort order. Default is 'asc'.
   * @returns A negative number if a < b, positive if a > b, zero if equal.
   */
  static compareByTimestamp<DataType extends SecretDataType = SecretDataType>(
    a: SecretMetadata<DataType>,
    b: SecretMetadata<DataType>,
    order: 'asc' | 'desc' = 'asc',
  ): number {
    return order === 'asc'
      ? a.timestamp - b.timestamp
      : b.timestamp - a.timestamp;
  }

  /**
   * Check if a SecretMetadata instance matches the given type.
   *
   * @param secret - The SecretMetadata instance to check.
   * @param type - The type to match against.
   * @returns True if the secret matches the type.
   */
  static matchesType<DataType extends SecretDataType = SecretDataType>(
    secret: SecretMetadata<DataType>,
    type: SecretType,
  ): boolean {
    return secret.type === type;
  }

  get data(): DataType {
    return this.#data;
  }

  get timestamp(): number {
    return this.#timestamp;
  }

  get type(): SecretType {
    return this.#type;
  }

  get itemId(): string | undefined {
    return this.#itemId;
  }

  get dataType(): EncAccountDataType | undefined {
    return this.#dataType;
  }

  get createdAt(): string | undefined {
    return this.#createdAt;
  }

  /**
   * The storage-level version from the SDK ('v1' or 'v2').
   *
   * @returns The storage-level version.
   */
  get storageVersion(): SecretDataItemOutput['version'] | undefined {
    return this.#storageVersion;
  }

  /**
   * Serialize the secret metadata and convert it to a Uint8Array.
   *
   * @returns The serialized SecretMetadata value in bytes.
   */
  toBytes(): Uint8Array {
    let _data: unknown = this.#data;
    if (this.#data instanceof Uint8Array) {
      // encode the raw secret to base64 encoded string
      // to create more compacted metadata
      _data = bytesToBase64(this.#data);
    }

    // serialize the metadata to a JSON string
    const serializedMetadata = JSON.stringify({
      data: _data,
      timestamp: this.#timestamp,
      type: this.#type,
    });

    // convert the serialized metadata to bytes(Uint8Array)
    return stringToBytes(serializedMetadata);
  }
}
