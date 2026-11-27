import { EncAccountDataType } from '@metamask/toprf-secure-backup';

import { SecretType } from '../../src/constants.js';
import { MockToprfEncryptorDecryptor } from './toprfEncryptor.js';

export const TOPRF_BASE_URL = /https:\/\/node-[1-5]\.dev-node\.web3auth\.io/u;

export const NODE_DETAILS_BASE_URL = 'https://api.web3auth.io';

/**
 * Node list for `sapphire_devnet`, matching the list bundled with the TOPRF
 * client. `torusNodePub` holds the nodes' public keys.
 */
export const MOCK_NODE_DETAILS_RESPONSE = {
  nodeDetails: {
    currentEpoch: '1',
    torusNodeEndpoints: [1, 2, 3, 4, 5].map(
      (index) => `https://node-${index}.dev-node.web3auth.io/sss/jrpc`,
    ),
    torusNodeSSSEndpoints: [1, 2, 3, 4, 5].map(
      (index) => `https://node-${index}.dev-node.web3auth.io/sss/jrpc`,
    ),
    torusNodeRSSEndpoints: [1, 2, 3, 4, 5].map(
      (index) => `https://node-${index}.dev-node.web3auth.io/rss`,
    ),
    torusNodeTSSEndpoints: [1, 2, 3, 4, 5].map(
      (index) => `https://node-${index}.dev-node.web3auth.io/tss`,
    ),
    torusIndexes: [1, 2, 3, 4, 5],
    torusNodePub: [
      {
        X: 'f74389b0a4c8d10d2a687ae575f69b20f412d41ab7f1fe6b358aa14871327247',
        Y: '54e3a73098ed9bced3ef8821736e9794f9264a1420c0c7ad15d2fa617ba35ef7',
      },
      {
        X: 'bc38813a6873e526087918507c78fc3a61624670ee851ecfb4f3bef55d027b5a',
        Y: 'ac4b21229f662a0aefdfdac21cf17c3261a392c74a8790db218b34e3e4c1d56a',
      },
      {
        X: 'b56541684ea5fa40c8337b7688d502f0e9e092098962ad344c34e94f06d293fb',
        Y: '759a998cef79d389082f9a75061a29190eec0cac99b8c25ddcf6b58569dad55c',
      },
      {
        X: '7bcb058d4c6ffc6ba4bfdfd93d141af35a66338a62c7c27cdad2ae3f8289b767',
        Y: '336ab1935e41ed4719e162587f0ab55518db4207a1eb36cc72303f1b86689d2b',
      },
      {
        X: 'bf12a136ef94399ea098f926f04e26a4ec4ac70f69cce274e8893704c4951773',
        Y: 'bdd44828020f52ce510e026338216ada184a6867eb4e19fb4c2d495d4a7e15e4',
      },
    ],
  },
};

export const MOCK_TOPRF_COMMITMENT_RESPONSE = {
  jsonrpc: '2.0',
  result: {
    signature: 'MOCK_NODE_SIGNATURE',
    data: 'MOCK_NODE_DATA',
    nodePubX: 'MOCK_NODE_PUB_X',
    nodePubY: 'MOCK_NODE_PUB_Y',
    nodeIndex: '1',
  },
  id: 10,
};

export const MOCK_TOPRF_AUTHENTICATION_RESPONSE = {
  jsonrpc: '2.0',
  result: {
    authToken: 'MOCK_AUTH_TOKEN',
    nodeIndex: 1,
    pubKey: 'MOCK_USER_PUB_KEY',
    keyIndex: 0,
    nodePubKey: 'MOCK_NODE_PUB_KEY',
  },
  id: 10,
};

export const MOCK_SECRET_DATA_ADD_RESPONSE = {
  success: true,
  message: 'Updated successfully',
};

export const MOCK_BATCH_SECRET_DATA_ADD_RESPONSE = {
  success: true,
  message: 'Updated successfully',
};

export const MOCK_SECRET_DATA_GET_RESPONSE = {
  success: true,
  data: [],
  ids: [],
};

export const MOCK_ACQUIRE_METADATA_LOCK_RESPONSE = {
  status: 1,
  id: 'MOCK_METADATA_LOCK_ID',
};

export const MOCK_RELEASE_METADATA_LOCK_RESPONSE = {
  status: 1,
};

export const MULTIPLE_MOCK_SECRET_METADATA = [
  {
    data: new Uint8Array(Buffer.from('seedPhrase1', 'utf-8')),
    timestamp: 10,
    type: SecretType.Mnemonic,
    itemId: 'srp-1',
    dataType: EncAccountDataType.PrimarySrp,
    createdAt: '00000001-0000-1000-8000-000000000001',
  },
  {
    data: new Uint8Array(Buffer.from('seedPhrase3', 'utf-8')),
    timestamp: 60,
    type: SecretType.Mnemonic,
    itemId: 'srp-3',
    dataType: EncAccountDataType.ImportedSrp,
    createdAt: '00000003-0000-1000-8000-000000000003',
  },
  {
    data: new Uint8Array(Buffer.from('seedPhrase2', 'utf-8')),
    timestamp: 20,
    type: SecretType.Mnemonic,
    itemId: 'srp-2',
    dataType: EncAccountDataType.ImportedSrp,
    createdAt: '00000002-0000-1000-8000-000000000002',
  },
];

type MockSecretDataInput = {
  data: Uint8Array;
  timestamp?: number;
  type?: SecretType;
  itemId: string;
  dataType?: EncAccountDataType;
  createdAt?: string;
};

/**
 * Creates a mock secret data get response
 *
 * @param secretDataArr - The data to be returned
 * @param password - The password to be used
 * @returns The mock secret data get response
 */
export function createMockSecretDataGetResponse(
  secretDataArr: MockSecretDataInput[],
  password: string,
): {
  success: boolean;
  data: string[];
  ids: string[];
  versions: ('v1' | 'v2')[];
  dataTypes: (EncAccountDataType | null)[];
  createdAt: (string | null)[];
} {
  const mockToprfEncryptor = new MockToprfEncryptorDecryptor();
  const ids: string[] = [];
  const versions: ('v1' | 'v2')[] = [];
  const dataTypes: (EncAccountDataType | null)[] = [];
  const createdAt: (string | null)[] = [];

  const encryptedSecretData = secretDataArr.map((secretData) => {
    const b64SecretData = Buffer.from(secretData.data).toString('base64');
    const timestamp = secretData.timestamp ?? Date.now();

    ids.push(secretData.itemId);
    // Default to 'v1' for legacy data (no dataType), otherwise 'v2'
    versions.push(secretData.dataType === undefined ? 'v1' : 'v2');
    dataTypes.push(secretData.dataType ?? null);
    createdAt.push(secretData.createdAt ?? null);

    const metadata = JSON.stringify({
      data: b64SecretData,
      timestamp,
      type: secretData.type,
    });

    return mockToprfEncryptor.encrypt(
      mockToprfEncryptor.deriveEncKey(password),
      new Uint8Array(Buffer.from(metadata, 'utf-8')),
    );
  });

  return {
    success: true,
    data: encryptedSecretData,
    ids,
    versions,
    dataTypes,
    createdAt,
  };
}
