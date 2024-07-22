"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkKWTSMLNDjs = require('./chunk-KWTSMLND.js');


var _chunk232HZSEVjs = require('./chunk-232HZSEV.js');


var _chunkAQPBSNWAjs = require('./chunk-AQPBSNWA.js');



var _chunkCGQRVA4Qjs = require('./chunk-CGQRVA4Q.js');


var _chunkHZEB53A6js = require('./chunk-HZEB53A6.js');




var _chunkDNVD3CHQjs = require('./chunk-DNVD3CHQ.js');


var _chunkNOYP2T77js = require('./chunk-NOYP2T77.js');


var _chunkQY4UST5Vjs = require('./chunk-QY4UST5V.js');


var _chunkTLX5QQK5js = require('./chunk-TLX5QQK5.js');


var _chunkIGY2S5BCjs = require('./chunk-IGY2S5BC.js');

// src/NotificationServicesController/index.ts
var NotificationServicesController_exports = {};
_chunkIGY2S5BCjs.__export.call(void 0, NotificationServicesController_exports, {
  Constants: () => _chunkQY4UST5Vjs.constants_exports,
  Controller: () => _chunkCGQRVA4Qjs.NotificationServicesController,
  Mocks: () => fixtures_exports,
  Processors: () => _chunkKWTSMLNDjs.processors_exports,
  Types: () => _chunk232HZSEVjs.types_exports,
  UI: () => _chunkAQPBSNWAjs.ui_exports,
  defaultState: () => _chunkCGQRVA4Qjs.defaultState
});

// src/NotificationServicesController/__fixtures__/index.ts
var fixtures_exports = {};
_chunkIGY2S5BCjs.__export.call(void 0, fixtures_exports, {
  CONTENTFUL_RESPONSE: () => CONTENTFUL_RESPONSE,
  MOCK_RAW_ON_CHAIN_NOTIFICATIONS: () => MOCK_RAW_ON_CHAIN_NOTIFICATIONS,
  MOCK_USER_STORAGE_ACCOUNT: () => MOCK_USER_STORAGE_ACCOUNT,
  MOCK_USER_STORAGE_CHAIN: () => MOCK_USER_STORAGE_CHAIN,
  createMockFeatureAnnouncementAPIResult: () => createMockFeatureAnnouncementAPIResult,
  createMockFeatureAnnouncementRaw: () => createMockFeatureAnnouncementRaw,
  createMockFullUserStorage: () => createMockFullUserStorage,
  createMockNotificationERC1155Received: () => createMockNotificationERC1155Received,
  createMockNotificationERC1155Sent: () => createMockNotificationERC1155Sent,
  createMockNotificationERC20Received: () => createMockNotificationERC20Received,
  createMockNotificationERC20Sent: () => createMockNotificationERC20Sent,
  createMockNotificationERC721Received: () => createMockNotificationERC721Received,
  createMockNotificationERC721Sent: () => createMockNotificationERC721Sent,
  createMockNotificationEthReceived: () => createMockNotificationEthReceived,
  createMockNotificationEthSent: () => createMockNotificationEthSent,
  createMockNotificationLidoReadyToBeWithdrawn: () => createMockNotificationLidoReadyToBeWithdrawn,
  createMockNotificationLidoStakeCompleted: () => createMockNotificationLidoStakeCompleted,
  createMockNotificationLidoWithdrawalCompleted: () => createMockNotificationLidoWithdrawalCompleted,
  createMockNotificationLidoWithdrawalRequested: () => createMockNotificationLidoWithdrawalRequested,
  createMockNotificationMetaMaskSwapsCompleted: () => createMockNotificationMetaMaskSwapsCompleted,
  createMockNotificationRocketPoolStakeCompleted: () => createMockNotificationRocketPoolStakeCompleted,
  createMockNotificationRocketPoolUnStakeCompleted: () => createMockNotificationRocketPoolUnStakeCompleted,
  createMockNotificationTrigger: () => createMockNotificationTrigger,
  createMockRawOnChainNotifications: () => createMockRawOnChainNotifications,
  createMockUserStorage: () => createMockUserStorage,
  createMockUserStorageWithTriggers: () => createMockUserStorageWithTriggers,
  getMockBatchCreateTriggersResponse: () => getMockBatchCreateTriggersResponse,
  getMockBatchDeleteTriggersResponse: () => getMockBatchDeleteTriggersResponse,
  getMockFeatureAnnouncementResponse: () => getMockFeatureAnnouncementResponse,
  getMockListNotificationsResponse: () => getMockListNotificationsResponse,
  getMockMarkNotificationsAsReadResponse: () => getMockMarkNotificationsAsReadResponse
});

// src/NotificationServicesController/__fixtures__/mock-feature-announcements.ts
function createMockFeatureAnnouncementAPIResult() {
  return {
    sys: {
      type: "Array"
    },
    total: 17,
    skip: 0,
    limit: 1,
    items: [
      {
        metadata: {
          tags: []
        },
        sys: {
          space: {
            sys: {
              type: "Link",
              linkType: "Space",
              id: "jdkgyfmyd9sw"
            }
          },
          id: "1ABRmHaNCgmxROKXXLXsMu",
          type: "Entry",
          createdAt: "2024-04-09T13:24:01.872Z",
          updatedAt: "2024-04-09T13:24:01.872Z",
          environment: {
            sys: {
              id: "master",
              type: "Link",
              linkType: "Environment"
            }
          },
          revision: 1,
          contentType: {
            sys: {
              type: "Link",
              linkType: "ContentType",
              id: "productAnnouncement"
            }
          },
          locale: "en-US"
        },
        fields: {
          title: "Don\u2019t miss out on airdrops and new NFT mints!",
          id: "dont-miss-out-on-airdrops-and-new-nft-mints",
          category: "ANNOUNCEMENT",
          shortDescription: "Check your airdrop eligibility and see trending NFT drops. Head over to the Explore tab to get started. ",
          image: {
            sys: {
              type: "Link",
              linkType: "Asset",
              id: "5jqq8sFeLc6XEoeWlpI3aB"
            }
          },
          longDescription: {
            data: {},
            content: [
              {
                data: {},
                content: [
                  {
                    data: {},
                    marks: [],
                    value: "You can now verify if any of your connected addresses are eligible for airdrops and other ERC-20 claims in a secure and convenient way. We\u2019ve also added trending NFT mints based on creators you\u2019ve minted from before or other tokens you hold. Head over to the Explore tab to get started. \n",
                    nodeType: "text"
                  }
                ],
                nodeType: "paragraph"
              }
            ],
            nodeType: "document"
          },
          link: {
            sys: {
              type: "Link",
              linkType: "Entry",
              id: "62xKYM2ydo4F1mS5q97K5q"
            }
          }
        }
      }
    ],
    includes: {
      Entry: [
        {
          metadata: {
            tags: []
          },
          sys: {
            space: {
              sys: {
                type: "Link",
                linkType: "Space",
                id: "jdkgyfmyd9sw"
              }
            },
            id: "62xKYM2ydo4F1mS5q97K5q",
            type: "Entry",
            createdAt: "2024-04-09T13:23:03.636Z",
            updatedAt: "2024-04-09T13:23:03.636Z",
            environment: {
              sys: {
                id: "master",
                type: "Link",
                linkType: "Environment"
              }
            },
            revision: 1,
            contentType: {
              sys: {
                type: "Link",
                linkType: "ContentType",
                id: "link"
              }
            },
            locale: "en-US"
          },
          fields: {
            extensionLinkText: "Try now",
            extensionLinkRoute: "home.html"
          }
        }
      ],
      Asset: [
        {
          metadata: {
            tags: []
          },
          sys: {
            space: {
              sys: {
                type: "Link",
                linkType: "Space",
                id: "jdkgyfmyd9sw"
              }
            },
            id: "5jqq8sFeLc6XEoeWlpI3aB",
            type: "Asset",
            createdAt: "2024-04-09T13:23:13.327Z",
            updatedAt: "2024-04-09T13:23:13.327Z",
            environment: {
              sys: {
                id: "master",
                type: "Link",
                linkType: "Environment"
              }
            },
            revision: 1,
            locale: "en-US"
          },
          fields: {
            title: "PDAPP notification image Airdrops & NFT mints",
            description: "",
            file: {
              url: "//images.ctfassets.net/jdkgyfmyd9sw/5jqq8sFeLc6XEoeWlpI3aB/73ee0f1afa9916c3a7538b0bbee09c26/PDAPP_notification_image_Airdrops___NFT_mints.png",
              details: {
                size: 797731,
                image: {
                  width: 2880,
                  height: 1921
                }
              },
              fileName: "PDAPP notification image_Airdrops & NFT mints.png",
              contentType: "image/png"
            }
          }
        }
      ]
    }
  };
}
function createMockFeatureAnnouncementRaw() {
  return {
    type: "features_announcement" /* FEATURES_ANNOUNCEMENT */,
    createdAt: "2999-04-09T13:24:01.872Z",
    data: {
      id: "dont-miss-out-on-airdrops-and-new-nft-mints",
      category: "ANNOUNCEMENT",
      title: "Don\u2019t miss out on airdrops and new NFT mints!",
      longDescription: `<p>You can now verify if any of your connected addresses are eligible for airdrops and other ERC-20 claims in a secure and convenient way. We\u2019ve also added trending NFT mints based on creators you\u2019ve minted from before or other tokens you hold. Head over to the Explore tab to get started.</p>`,
      shortDescription: "Check your airdrop eligibility and see trending NFT drops. Head over to the Explore tab to get started.",
      image: {
        title: "PDAPP notification image Airdrops & NFT mints",
        description: "",
        url: "//images.ctfassets.net/jdkgyfmyd9sw/5jqq8sFeLc6XEoeWlpI3aB/73ee0f1afa9916c3a7538b0bbee09c26/PDAPP_notification_image_Airdrops___NFT_mints.png"
      },
      extensionLink: {
        extensionLinkText: "Try now",
        extensionLinkRoute: "home.html"
      }
    }
  };
}

// src/NotificationServicesController/__fixtures__/mock-notification-trigger.ts
var _uuid = require('uuid');
function createMockNotificationTrigger(override) {
  return {
    id: _uuid.v4.call(void 0, ),
    address: "0xFAKE_ADDRESS",
    chainId: "1",
    kind: "eth_sent",
    enabled: true,
    ...override
  };
}

// src/NotificationServicesController/__fixtures__/mock-notification-user-storage.ts
var MOCK_USER_STORAGE_ACCOUNT = "0x0000000000000000000000000000000000000000";
var MOCK_USER_STORAGE_CHAIN = "1";
function createMockUserStorage(override) {
  return {
    [_chunkTLX5QQK5js.USER_STORAGE_VERSION_KEY]: "1",
    [MOCK_USER_STORAGE_ACCOUNT]: {
      [MOCK_USER_STORAGE_CHAIN]: {
        "111-111-111-111": {
          k: "erc20_received" /* ERC20_RECEIVED */,
          e: true
        },
        "222-222-222-222": {
          k: "erc20_sent" /* ERC20_SENT */,
          e: true
        }
      }
    },
    ...override
  };
}
function createMockUserStorageWithTriggers(triggers) {
  const userStorage = {
    [_chunkTLX5QQK5js.USER_STORAGE_VERSION_KEY]: "1",
    [MOCK_USER_STORAGE_ACCOUNT]: {
      [MOCK_USER_STORAGE_CHAIN]: {}
    }
  };
  triggers.forEach((t) => {
    let tId;
    let e;
    let k;
    if (typeof t === "string") {
      tId = t;
      e = true;
      k = "erc20_received" /* ERC20_RECEIVED */;
    } else {
      tId = t.id;
      e = t.e;
      k = t.k ?? "erc20_received" /* ERC20_RECEIVED */;
    }
    userStorage[MOCK_USER_STORAGE_ACCOUNT][MOCK_USER_STORAGE_CHAIN][tId] = {
      k,
      e
    };
  });
  return userStorage;
}
function createMockFullUserStorage(props = {}) {
  return _chunkNOYP2T77js.initializeUserStorage.call(void 0, 
    [{ address: props.address ?? MOCK_USER_STORAGE_ACCOUNT }],
    props.triggersEnabled ?? true
  );
}

// src/NotificationServicesController/__fixtures__/mock-raw-notifications.ts
function createMockNotificationEthSent() {
  const mockNotification = {
    type: "eth_sent" /* ETH_SENT */,
    id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    trigger_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    chain_id: 1,
    block_number: 17485840,
    block_timestamp: "2022-03-01T00:00:00Z",
    tx_hash: "0xb2256b183f2fb3872f99294ab55fb03e6a479b0d4aca556a3b27568b712505a6",
    unread: true,
    created_at: "2022-03-01T00:00:00Z",
    address: "0x881D40237659C251811CEC9c364ef91dC08D300C",
    data: {
      kind: "eth_sent",
      network_fee: {
        gas_price: "207806259583",
        native_token_price_in_usd: "0.83"
      },
      from: "0x881D40237659C251811CEC9c364ef91dC08D300C",
      to: "0x881D40237659C251811CEC9c364ef91dC08D300D",
      amount: {
        usd: "670.64",
        eth: "0.005"
      }
    }
  };
  return mockNotification;
}
function createMockNotificationEthReceived() {
  const mockNotification = {
    type: "eth_received" /* ETH_RECEIVED */,
    id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    trigger_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    chain_id: 1,
    block_number: 17485840,
    block_timestamp: "2022-03-01T00:00:00Z",
    tx_hash: "0xb2256b183f2fb3872f99294ab55fb03e6a479b0d4aca556a3b27568b712505a6",
    unread: true,
    created_at: "2022-03-01T00:00:00Z",
    address: "0x881D40237659C251811CEC9c364ef91dC08D300C",
    data: {
      kind: "eth_received",
      network_fee: {
        gas_price: "207806259583",
        native_token_price_in_usd: "0.83"
      },
      from: "0x881D40237659C251811CEC9c364ef91dC08D300C",
      to: "0x881D40237659C251811CEC9c364ef91dC08D300D",
      amount: {
        usd: "670.64",
        eth: "808.000000000000000000"
      }
    }
  };
  return mockNotification;
}
function createMockNotificationERC20Sent() {
  const mockNotification = {
    type: "erc20_sent" /* ERC20_SENT */,
    id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    trigger_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    chain_id: 1,
    block_number: 17485840,
    block_timestamp: "2022-03-01T00:00:00Z",
    tx_hash: "0xb2256b183f2fb3872f99294ab55fb03e6a479b0d4aca556a3b27568b712505a6",
    unread: true,
    created_at: "2022-03-01T00:00:00Z",
    address: "0x881D40237659C251811CEC9c364ef91dC08D300C",
    data: {
      kind: "erc20_sent",
      network_fee: {
        gas_price: "207806259583",
        native_token_price_in_usd: "0.83"
      },
      to: "0xecc19e177d24551aa7ed6bc6fe566eca726cc8a9",
      from: "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae",
      token: {
        usd: "1.00",
        name: "USDC",
        image: "https://raw.githubusercontent.com/MetaMask/contract-metadata/master/images/usdc.svg",
        amount: "4956250000",
        symbol: "USDC",
        address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        decimals: "6"
      }
    }
  };
  return mockNotification;
}
function createMockNotificationERC20Received() {
  const mockNotification = {
    type: "erc20_received" /* ERC20_RECEIVED */,
    id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    trigger_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    chain_id: 1,
    block_number: 17485840,
    block_timestamp: "2022-03-01T00:00:00Z",
    tx_hash: "0xb2256b183f2fb3872f99294ab55fb03e6a479b0d4aca556a3b27568b712505a6",
    unread: true,
    created_at: "2022-03-01T00:00:00Z",
    address: "0x881D40237659C251811CEC9c364ef91dC08D300C",
    data: {
      kind: "erc20_received",
      network_fee: {
        gas_price: "207806259583",
        native_token_price_in_usd: "0.83"
      },
      to: "0xeae7380dd4cef6fbd1144f49e4d1e6964258a4f4",
      from: "0x51c72848c68a965f66fa7a88855f9f7784502a7f",
      token: {
        usd: "0.00",
        name: "SHIBA INU",
        image: "https://raw.githubusercontent.com/MetaMask/contract-metadata/master/images/shib.svg",
        amount: "8382798736999999457296646144",
        symbol: "SHIB",
        address: "0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce",
        decimals: "18"
      }
    }
  };
  return mockNotification;
}
function createMockNotificationERC721Sent() {
  const mockNotification = {
    type: "erc721_sent" /* ERC721_SENT */,
    block_number: 18576643,
    block_timestamp: "1700043467",
    chain_id: 1,
    created_at: "2023-11-15T11:08:17.895407Z",
    address: "0x881D40237659C251811CEC9c364ef91dC08D300C",
    data: {
      to: "0xf47f628fe3bd2595e9ab384bfffc3859b448e451",
      nft: {
        name: "Captainz #8680",
        image: "https://i.seadn.io/s/raw/files/ae0fc06714ff7fb40217340d8a242c0e.gif?w=500&auto=format",
        token_id: "8680",
        collection: {
          name: "The Captainz",
          image: "https://i.seadn.io/gcs/files/6df4d75778066bce740050615bc84e21.png?w=500&auto=format",
          symbol: "Captainz",
          address: "0x769272677fab02575e84945f03eca517acc544cc"
        }
      },
      from: "0x24a0bb54b7e7a8e406e9b28058a9fd6c49e6df4f",
      kind: "erc721_sent",
      network_fee: {
        gas_price: "24550653274",
        native_token_price_in_usd: "1986.61"
      }
    },
    id: "a4193058-9814-537e-9df4-79dcac727fb6",
    trigger_id: "028485be-b994-422b-a93b-03fcc01ab715",
    tx_hash: "0x0833c69fb41cf972a0f031fceca242939bc3fcf82b964b74606649abcad371bd",
    unread: true
  };
  return mockNotification;
}
function createMockNotificationERC721Received() {
  const mockNotification = {
    type: "erc721_received" /* ERC721_RECEIVED */,
    block_number: 18571446,
    block_timestamp: "1699980623",
    chain_id: 1,
    created_at: "2023-11-14T17:40:52.319281Z",
    address: "0x881D40237659C251811CEC9c364ef91dC08D300C",
    data: {
      to: "0xba7f3daa8adfdad686574406ab9bd5d2f0a49d2e",
      nft: {
        name: "The Plague #2722",
        image: "https://i.seadn.io/s/raw/files/a96f90ec8ebf55a2300c66a0c46d6a16.png?w=500&auto=format",
        token_id: "2722",
        collection: {
          name: "The Plague NFT",
          image: "https://i.seadn.io/gcs/files/4577987a5ca45ca5118b2e31559ee4d1.jpg?w=500&auto=format",
          symbol: "FROG",
          address: "0xc379e535caff250a01caa6c3724ed1359fe5c29b"
        }
      },
      from: "0x24a0bb54b7e7a8e406e9b28058a9fd6c49e6df4f",
      kind: "erc721_received",
      network_fee: {
        gas_price: "53701898538",
        native_token_price_in_usd: "2047.01"
      }
    },
    id: "00a79d24-befa-57ed-a55a-9eb8696e1654",
    trigger_id: "d24ac26a-8579-49ec-9947-d04d63592ebd",
    tx_hash: "0xe554c9e29e6eeca8ba94da4d047334ba08b8eb9ca3b801dd69cec08dfdd4ae43",
    unread: true
  };
  return mockNotification;
}
function createMockNotificationERC1155Sent() {
  const mockNotification = {
    type: "erc1155_sent" /* ERC1155_SENT */,
    block_number: 18615206,
    block_timestamp: "1700510003",
    chain_id: 1,
    created_at: "2023-11-20T20:44:10.110706Z",
    address: "0x881D40237659C251811CEC9c364ef91dC08D300C",
    data: {
      to: "0x15bd77ccacf2da39b84f0c31fee2e451225bb190",
      nft: {
        name: "IlluminatiNFT DAO",
        image: "https://i.seadn.io/gcs/files/79a77cb37c7b2f1069f752645d29fea7.jpg?w=500&auto=format",
        token_id: "1",
        collection: {
          name: "IlluminatiNFT DAO",
          image: "https://i.seadn.io/gae/LTKz3om2eCQfn3M6PkqEmY7KhLtdMCOm0QVch2318KJq7-KyToCH7NBTMo4UuJ0AZI-oaBh1HcgrAEIEWYbXY3uMcYpuGXunaXEh?w=500&auto=format",
          symbol: "TRUTH",
          address: "0xe25f0fe686477f9df3c2876c4902d3b85f75f33a"
        }
      },
      from: "0x0000000000000000000000000000000000000000",
      kind: "erc1155_sent",
      network_fee: {
        gas_price: "33571446596",
        native_token_price_in_usd: "2038.88"
      }
    },
    id: "a09ff9d1-623a-52ab-a3d4-c7c8c9a58362",
    trigger_id: "e2130f7d-78b8-4c34-999a-3f3d3bb5b03c",
    tx_hash: "0x03381aba290facbaf71c123e263c8dc3dd550aac00ef589cce395182eaeff76f",
    unread: true
  };
  return mockNotification;
}
function createMockNotificationERC1155Received() {
  const mockNotification = {
    type: "erc1155_received" /* ERC1155_RECEIVED */,
    block_number: 18615206,
    block_timestamp: "1700510003",
    chain_id: 1,
    created_at: "2023-11-20T20:44:10.110706Z",
    address: "0x881D40237659C251811CEC9c364ef91dC08D300C",
    data: {
      to: "0x15bd77ccacf2da39b84f0c31fee2e451225bb190",
      nft: {
        name: "IlluminatiNFT DAO",
        image: "https://i.seadn.io/gcs/files/79a77cb37c7b2f1069f752645d29fea7.jpg?w=500&auto=format",
        token_id: "1",
        collection: {
          name: "IlluminatiNFT DAO",
          image: "https://i.seadn.io/gae/LTKz3om2eCQfn3M6PkqEmY7KhLtdMCOm0QVch2318KJq7-KyToCH7NBTMo4UuJ0AZI-oaBh1HcgrAEIEWYbXY3uMcYpuGXunaXEh?w=500&auto=format",
          symbol: "TRUTH",
          address: "0xe25f0fe686477f9df3c2876c4902d3b85f75f33a"
        }
      },
      from: "0x0000000000000000000000000000000000000000",
      kind: "erc1155_received",
      network_fee: {
        gas_price: "33571446596",
        native_token_price_in_usd: "2038.88"
      }
    },
    id: "b6b93c84-e8dc-54ed-9396-7ea50474843a",
    trigger_id: "710c8abb-43a9-42a5-9d86-9dd258726c82",
    tx_hash: "0x03381aba290facbaf71c123e263c8dc3dd550aac00ef589cce395182eaeff76f",
    unread: true
  };
  return mockNotification;
}
function createMockNotificationMetaMaskSwapsCompleted() {
  const mockNotification = {
    type: "metamask_swap_completed" /* METAMASK_SWAP_COMPLETED */,
    block_number: 18377666,
    block_timestamp: "1697637275",
    chain_id: 1,
    created_at: "2023-10-18T13:58:49.854596Z",
    address: "0x881D40237659C251811CEC9c364ef91dC08D300C",
    data: {
      kind: "metamask_swap_completed",
      rate: "1558.27",
      token_in: {
        usd: "1576.73",
        image: "https://token.api.cx.metamask.io/assets/nativeCurrencyLogos/ethereum.svg",
        amount: "9000000000000000",
        symbol: "ETH",
        address: "0x0000000000000000000000000000000000000000",
        decimals: "18",
        name: "Ethereum"
      },
      token_out: {
        usd: "1.00",
        image: "https://raw.githubusercontent.com/MetaMask/contract-metadata/master/images/usdt.svg",
        amount: "14024419",
        symbol: "USDT",
        address: "0xdac17f958d2ee523a2206206994597c13d831ec7",
        decimals: "6",
        name: "USDT"
      },
      network_fee: {
        gas_price: "15406129273",
        native_token_price_in_usd: "1576.73"
      }
    },
    id: "7ddfe6a1-ac52-5ffe-aa40-f04242db4b8b",
    trigger_id: "d2eaa2eb-2e6e-4fd5-8763-b70ea571b46c",
    tx_hash: "0xf69074290f3aa11bce567aabc9ca0df7a12559dfae1b80ba1a124e9dfe19ecc5",
    unread: true
  };
  return mockNotification;
}
function createMockNotificationRocketPoolStakeCompleted() {
  const mockNotification = {
    type: "rocketpool_stake_completed" /* ROCKETPOOL_STAKE_COMPLETED */,
    block_number: 18585057,
    block_timestamp: "1700145059",
    chain_id: 1,
    created_at: "2023-11-20T12:02:48.796824Z",
    address: "0x881D40237659C251811CEC9c364ef91dC08D300C",
    data: {
      kind: "rocketpool_stake_completed",
      stake_in: {
        usd: "2031.86",
        name: "Ethereum",
        image: "https://token.api.cx.metamask.io/assets/nativeCurrencyLogos/ethereum.svg",
        amount: "190690478063438272",
        symbol: "ETH",
        address: "0x0000000000000000000000000000000000000000",
        decimals: "18"
      },
      stake_out: {
        usd: "2226.49",
        name: "Rocket Pool ETH",
        image: "https://raw.githubusercontent.com/MetaMask/contract-metadata/master/images/rETH.svg",
        amount: "175024360778165879",
        symbol: "RETH",
        address: "0xae78736Cd615f374D3085123A210448E74Fc6393",
        decimals: "18"
      },
      network_fee: {
        gas_price: "36000000000",
        native_token_price_in_usd: "2031.86"
      }
    },
    id: "c2a2f225-b2fb-5d6c-ba56-e27a5c71ffb9",
    trigger_id: "5110ff97-acff-40c0-83b4-11d487b8c7b0",
    tx_hash: "0xcfc0693bf47995907b0f46ef0644cf16dd9a0de797099b2e00fd481e1b2117d3",
    unread: true
  };
  return mockNotification;
}
function createMockNotificationRocketPoolUnStakeCompleted() {
  const mockNotification = {
    type: "rocketpool_unstake_completed" /* ROCKETPOOL_UNSTAKE_COMPLETED */,
    block_number: 18384336,
    block_timestamp: "1697718011",
    chain_id: 1,
    created_at: "2023-10-19T13:11:10.623042Z",
    address: "0x881D40237659C251811CEC9c364ef91dC08D300C",
    data: {
      kind: "rocketpool_unstake_completed",
      stake_in: {
        usd: "1686.34",
        image: "https://raw.githubusercontent.com/MetaMask/contract-metadata/master/images/rETH.svg",
        amount: "66608041413696770",
        symbol: "RETH",
        address: "0xae78736Cd615f374D3085123A210448E74Fc6393",
        decimals: "18",
        name: "Rocketpool Eth"
      },
      stake_out: {
        usd: "1553.75",
        image: "https://token.api.cx.metamask.io/assets/nativeCurrencyLogos/ethereum.svg",
        amount: "72387843427700824",
        symbol: "ETH",
        address: "0x0000000000000000000000000000000000000000",
        decimals: "18",
        name: "Ethereum"
      },
      network_fee: {
        gas_price: "5656322987",
        native_token_price_in_usd: "1553.75"
      }
    },
    id: "d8c246e7-a0a4-5f1d-b079-2b1707665fbc",
    trigger_id: "291ec897-f569-4837-b6c0-21001b198dff",
    tx_hash: "0xc7972a7e409abfc62590ec90e633acd70b9b74e76ad02305be8bf133a0e22d5f",
    unread: true
  };
  return mockNotification;
}
function createMockNotificationLidoStakeCompleted() {
  const mockNotification = {
    type: "lido_stake_completed" /* LIDO_STAKE_COMPLETED */,
    block_number: 18487118,
    block_timestamp: "1698961091",
    chain_id: 1,
    created_at: "2023-11-02T22:28:49.970865Z",
    address: "0x881D40237659C251811CEC9c364ef91dC08D300C",
    data: {
      kind: "lido_stake_completed",
      stake_in: {
        usd: "1806.33",
        name: "Ethereum",
        image: "https://token.api.cx.metamask.io/assets/nativeCurrencyLogos/ethereum.svg",
        amount: "330303634023928032",
        symbol: "ETH",
        address: "0x0000000000000000000000000000000000000000",
        decimals: "18"
      },
      stake_out: {
        usd: "1801.30",
        name: "Liquid staked Ether 2.0",
        image: "https://raw.githubusercontent.com/MetaMask/contract-metadata/master/images/stETH.svg",
        amount: "330303634023928032",
        symbol: "STETH",
        address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
        decimals: "18"
      },
      network_fee: {
        gas_price: "26536359866",
        native_token_price_in_usd: "1806.33"
      }
    },
    id: "9d9b1467-b3ee-5492-8ca2-22382657b690",
    trigger_id: "ec10d66a-f78f-461f-83c9-609aada8cc50",
    tx_hash: "0x8cc0fa805f7c3b1743b14f3b91c6b824113b094f26d4ccaf6a71ad8547ce6a0f",
    unread: true
  };
  return mockNotification;
}
function createMockNotificationLidoWithdrawalRequested() {
  const mockNotification = {
    type: "lido_withdrawal_requested" /* LIDO_WITHDRAWAL_REQUESTED */,
    block_number: 18377760,
    block_timestamp: "1697638415",
    chain_id: 1,
    created_at: "2023-10-18T15:04:02.482526Z",
    address: "0x881D40237659C251811CEC9c364ef91dC08D300C",
    data: {
      kind: "lido_withdrawal_requested",
      stake_in: {
        usd: "1568.54",
        image: "https://raw.githubusercontent.com/MetaMask/contract-metadata/master/images/stETH.svg",
        amount: "97180668792218669859",
        symbol: "STETH",
        address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
        decimals: "18",
        name: "Staked Eth"
      },
      stake_out: {
        usd: "1576.73",
        image: "https://token.api.cx.metamask.io/assets/nativeCurrencyLogos/ethereum.svg",
        amount: "97180668792218669859",
        symbol: "ETH",
        address: "0x0000000000000000000000000000000000000000",
        decimals: "18",
        name: "Ethereum"
      },
      network_fee: {
        gas_price: "11658906980",
        native_token_price_in_usd: "1576.73"
      }
    },
    id: "29ddc718-78c6-5f91-936f-2bef13a605f0",
    trigger_id: "ef003925-3379-4ba7-9e2d-8218690cadc8",
    tx_hash: "0x58b5f82e084cb750ea174e02b20fbdfd2ba8d78053deac787f34fc38e5d427aa",
    unread: true
  };
  return mockNotification;
}
function createMockNotificationLidoWithdrawalCompleted() {
  const mockNotification = {
    type: "lido_withdrawal_completed" /* LIDO_WITHDRAWAL_COMPLETED */,
    block_number: 18378208,
    block_timestamp: "1697643851",
    chain_id: 1,
    created_at: "2023-10-18T16:35:03.147606Z",
    address: "0x881D40237659C251811CEC9c364ef91dC08D300C",
    data: {
      kind: "lido_withdrawal_completed",
      stake_in: {
        usd: "1570.23",
        image: "https://raw.githubusercontent.com/MetaMask/contract-metadata/master/images/stETH.svg",
        amount: "35081997661451346",
        symbol: "STETH",
        address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
        decimals: "18",
        name: "Staked Eth"
      },
      stake_out: {
        usd: "1571.74",
        image: "https://token.api.cx.metamask.io/assets/nativeCurrencyLogos/ethereum.svg",
        amount: "35081997661451346",
        symbol: "ETH",
        address: "0x0000000000000000000000000000000000000000",
        decimals: "18",
        name: "Ethereum"
      },
      network_fee: {
        gas_price: "12699495150",
        native_token_price_in_usd: "1571.74"
      }
    },
    id: "f4ef0b7f-5612-537f-9144-0b5c63ae5391",
    trigger_id: "d73df14d-ce73-4f38-bad3-ab028154042c",
    tx_hash: "0xe6d210d2e601ef3dd1075c48e71452cf35f2daae3886911e964e3babad8ac657",
    unread: true
  };
  return mockNotification;
}
function createMockNotificationLidoReadyToBeWithdrawn() {
  const mockNotification = {
    type: "lido_stake_ready_to_be_withdrawn" /* LIDO_STAKE_READY_TO_BE_WITHDRAWN */,
    block_number: 18378208,
    block_timestamp: "1697643851",
    chain_id: 1,
    created_at: "2023-10-18T16:35:03.147606Z",
    address: "0x881D40237659C251811CEC9c364ef91dC08D300C",
    data: {
      kind: "lido_stake_ready_to_be_withdrawn",
      request_id: "123456789",
      staked_eth: {
        address: "0x881D40237659C251811CEC9c364ef91dC08D300F",
        symbol: "ETH",
        name: "Ethereum",
        amount: "2.5",
        decimals: "18",
        image: "https://token.api.cx.metamask.io/assets/nativeCurrencyLogos/ethereum.svg",
        usd: "10000.00"
      }
    },
    id: "f4ef0b7f-5612-537f-9144-0b5c63ae5391",
    trigger_id: "d73df14d-ce73-4f38-bad3-ab028154042c",
    tx_hash: "0xe6d210d2e601ef3dd1075c48e71452cf35f2daae3886911e964e3babad8ac657",
    unread: true
  };
  return mockNotification;
}
function createMockRawOnChainNotifications() {
  return [1, 2, 3].map((id) => {
    const notification = createMockNotificationEthSent();
    notification.id += `-${id}`;
    return notification;
  });
}

// src/NotificationServicesController/__fixtures__/mockResponses.ts
var CONTENTFUL_RESPONSE = createMockFeatureAnnouncementAPIResult();
var getMockFeatureAnnouncementResponse = () => {
  return {
    url: _chunkHZEB53A6js.FEATURE_ANNOUNCEMENT_API,
    requestMethod: "GET",
    response: CONTENTFUL_RESPONSE
  };
};
var getMockBatchCreateTriggersResponse = () => {
  return {
    url: _chunkDNVD3CHQjs.TRIGGER_API_BATCH_ENDPOINT,
    requestMethod: "POST",
    response: null
  };
};
var getMockBatchDeleteTriggersResponse = () => {
  return {
    url: _chunkDNVD3CHQjs.TRIGGER_API_BATCH_ENDPOINT,
    requestMethod: "DELETE",
    response: null
  };
};
var MOCK_RAW_ON_CHAIN_NOTIFICATIONS = createMockRawOnChainNotifications();
var getMockListNotificationsResponse = () => {
  return {
    url: _chunkDNVD3CHQjs.NOTIFICATION_API_LIST_ENDPOINT,
    requestMethod: "POST",
    response: MOCK_RAW_ON_CHAIN_NOTIFICATIONS
  };
};
var getMockMarkNotificationsAsReadResponse = () => {
  return {
    url: _chunkDNVD3CHQjs.NOTIFICATION_API_MARK_ALL_AS_READ_ENDPOINT,
    requestMethod: "POST",
    response: null
  };
};




exports.fixtures_exports = fixtures_exports; exports.NotificationServicesController_exports = NotificationServicesController_exports;
//# sourceMappingURL=chunk-OM6AY7JR.js.map