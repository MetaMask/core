import type { EncAccountDataType } from '@metamask/toprf-secure-backup';
import {
  base64ToBytes,
  bytesToBase64,
  stringToBytes,
  bytesToString,
} from '@metamask/utils';

import {
  SeedlessOnboardingControllerErrorMessage,
  SecretType,
  SecretMetadataVersion,
} from './constants';
import type { SecretDataType, SecretMetadataOptions } from './types';

type ISecretMetadata<DataType extends SecretDataType = Uint8Array> = {
  data: DataType;
  timestamp: number;
  type: SecretType;
  version: SecretMetadataVersion;
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
 * Storage-level metadata from the metadata store (not encrypted).
 */
type StorageMetadata = {
  itemId?: string;
  dataType?: EncAccountDataType;
  createdAt?: string;
  /**
   * The storage-level version from the SDK ('v1' or 'v2').
   * This is different from the encrypted data version (SecretMetadataVersion).
   * - 'v1': Legacy items created before dataType was introduced
   * - 'v2': Items with dataType set (either new or migrated)
   */
  storageVersion?: 'v1' | 'v2';
};

export class SecretMetadata<DataType extends SecretDataType = Uint8Array>
  implements ISecretMetadata<DataType>
{
  readonly #data: DataType;

  readonly #timestamp: number;

  readonly #type: SecretType;

  readonly #version: SecretMetadataVersion;

  // Storage-level metadata (not encrypted)
  readonly #itemId?: string;

  readonly #dataType?: EncAccountDataType;

  readonly #createdAt?: string;

  readonly #storageVersion?: 'v1' | 'v2';

  /**
   * Create a new SecretMetadata instance.
   *
   * @param data - The secret to add metadata to.
   * @param options - The options for the secret metadata.
   * @param options.timestamp - The timestamp when the secret was created.
   * @param options.type - The type of the secret.
   * @param options.version - The version of the secret metadata.
   * @param storageMetadata - Storage-level metadata from the metadata store.
   */
  constructor(
    data: DataType,
    options?: Partial<SecretMetadataOptions>,
    storageMetadata?: StorageMetadata,
  ) {
    this.#data = data;
    this.#timestamp = options?.timestamp ?? Date.now();
    this.#type = options?.type ?? SecretType.Mnemonic;
    this.#version = options?.version ?? SecretMetadataVersion.V1;
    this.#itemId = storageMetadata?.itemId;
    this.#dataType = storageMetadata?.dataType;
    this.#createdAt = storageMetadata?.createdAt;
    this.#storageVersion = storageMetadata?.storageVersion;
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
    storageMetadata?: StorageMetadata,
  ): SecretMetadata<DataType> {
    const serializedMetadata = bytesToString(rawMetadata);
    const parsedMetadata = JSON.parse(serializedMetadata);

    SecretMetadata.assertIsValidSecretMetadataJson<DataType>(parsedMetadata);

    // if the type is not provided, we default to Mnemonic for the backwards compatibility
    const type = parsedMetadata.type ?? SecretType.Mnemonic;
    const version = parsedMetadata.version ?? SecretMetadataVersion.V1;

    let data: DataType;
    try {
      data = base64ToBytes(parsedMetadata.data) as DataType;
    } catch {
      data = parsedMetadata.data as DataType;
    }

    return new SecretMetadata<DataType>(
      data,
      {
        timestamp: parsedMetadata.timestamp,
        type,
        version,
      },
      storageMetadata,
    );
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

  get version(): SecretMetadataVersion {
    return this.#version;
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
   * This is different from `version` which is the encrypted data format version.
   *
   * @returns The storage-level version.
   */
  get storageVersion(): 'v1' | 'v2' | undefined {
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
      version: this.#version,
    });

    // convert the serialized metadata to bytes(Uint8Array)
    return stringToBytes(serializedMetadata);
  }
}
