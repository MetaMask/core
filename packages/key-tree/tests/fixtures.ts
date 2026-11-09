import { mnemonicToSeedSync } from '@metamask/scure-bip39';
import { wordlist } from '@metamask/scure-bip39/dist/wordlists/english.js';

export default {
  // Fixtures defined and used in this package
  local: {
    mnemonic:
      'romance hurry grit huge rifle ordinary loud toss sound congress upset twist',
    seed: mnemonicToSeedSync(
      'romance hurry grit huge rifle ordinary loud toss sound congress upset twist',
      wordlist,
    ),
    addresses: [
      '0x5df603999c3d5ca2ab828339a9883585b1bce11b',
      '0x441c07e32a609afd319ffbb66432b424058bcfe9',
      '0x1f7c93dfe849c06dd610e77473bfaaef7f183c7c',
      '0x9e28bae18e0e358b12796697c6546f77d4657527',
      '0x6e7734c7f4fb973a3800b72fb1a6bf82d85d3d29',
      '0xf87328a8ea5208946c60dbd9385d4c8533ad5dd8',
    ],
  },

  // https://github.com/brave/eth-hd-keyring/blob/482acf341f01a8d1e924d55bfdbd309444a78e46/test/index.js#L10-L12
  // The state of the default branch as of 2021-10-19
  // eslint-disable-next-line @typescript-eslint/naming-convention
  'eth-hd-keyring': {
    mnemonic:
      'finish oppose decorate face calm tragic certain desk hour urge dinosaur mango',
    addresses: [
      '0x1c96099350f13d558464ec79b9be4445aa0ef579',
      '0x1b00aed43a693f3a957f9feb5cc08afa031e37a0',
      '0x8c9ba4f86ae12250ee1c3676ee925c77426d0b68',
      '0xffe45dbc6c1bee8f211da2ec961f73b82e9ab42c',
      '0xb8a13c465c9a0a46f262a1ad666a752923e65b8c',
    ],
  },

  // https://github.com/ethereumjs/ethereumjs-wallet/blob/2bc21b408da3b002a95aa752b94fa039ffc64e0f/test/hdkey.spec.ts
  // The state of the default branch as of 2021-10-19
  // eslint-disable-next-line @typescript-eslint/naming-convention
  'ethereumjs-wallet': {
    hexSeed:
      '0x747f302d9c916698912d5f70be53a6cf53bc495803a5523d3a7c3afa2afba94ec3803f838b3e1929ab5481f9da35441372283690fdcf27372c38f40ba134fe03',
    privateKey:
      '0xf29d6ddd6b0cd1fd59ed99900edd5a53e905b87dfe06824751010feb5228d960',
    publicKey:
      '0x04f7e989b55ebf3f9acfd32303e83069a9e4220bfc128f962325e6aa87e0f11f902a188c3f22f975c064a20c12b5523c53735f42467f2b83546869180abc42751e',
    address: '0xb9f89177a4ce589e6d18c33a9748bcc8063836df',
    // The path used is modified from the ethereumjs-wallet original, which
    // isn't BIP-44 compatible. Since we're testing against their
    // implementation, not any reference values, this is fine.
    path: {
      ours: {
        tuple: [`bip32:44'`, `bip32:0'`, `bip32:0'`, `bip32:1`],
        string: [`bip32:44'/bip32:0'/bip32:0'/bip32:1`],
      },
      theirs: "m/44'/0'/0'/1",
    },
    sampleAddressIndices: [
      {
        index: 0,
        address: '0xc5ba325f997531b5f0f50868913f0ce2fc0386bd',
        publicKey:
          '0x0438e5105bf4d908b40743bd3fc0e8e4ac281872086bf3323dfb4459a8b147aaa74b2b6624479ce069d60ff41336ce7eb0613f66ee91ba72a7581144134d814624',
      },
      {
        index: 1,
        address: '0x326aa42f2b600f624d800e109b1e146906bc8175',
        publicKey:
          '0x04fcdae40d78db4aaa196c8f421f9d9243934f4abc69de95dd27522e275de7276b486b6219ad930775127a5645a226a716a52accc456cd93ea82f56ee98994cf6e',
      },
      {
        index: 5,
        address: '0x6d0cc8671c91559d5f2d43de9c33eee0497db7cd',
        publicKey:
          '0x04226d57014fd0e9eea04a6de8e2071b111b42a102e416f21529698acfec7b78a0ba774dd957dfb6c71f3c597b7cb3ee9c08eeb48f7bf34a8dc24319d743339346',
      },
      {
        index: 50,
        address: '0x7bf971adda7f4487ac8f3dbd7450463ff3624f94',
        publicKey:
          '0x04c7fa0b4154bcb1e2d854c035ba591c3b87ccfbf3fafd0ed30585a1f843e79efcea470920b3fba70524b8a9854ddcfa05192de7d54154e28a8156b5d83a3a7883',
      },
      {
        index: 500,
        address: '0x564d7507d39a881d04bffc0120ebd331e7c41758',
        publicKey:
          '0x0461091945ed21fa036f0e97b4135fc01fb936910989519ba9a8c1c0867f3b34fbe6941f8529d1771532d79fdb2060cecaa12f12323086aec6eeb2ba9a9d9af3e9',
      },
      {
        index: 5000,
        address: '0x7496ff062c1fe3e750dff9cbbe317558161ba6db',
        publicKey:
          '0x04cceed14fef73e6c61e648761df3489e6cd87dfbcfa20241fd001675654ecb3d8a0d3b50410a9444de6d38af04f28add1ae12280889b5816dfc66a597cea539ec',
      },
      {
        index: 4_999_999,
        address: '0xddf1f1a72a668d5014ec57a24019291fd2a00197',
        publicKey:
          '0x04b1eed5ab048a7de8939c1a9536d04076982454d7883ec665e4e7da4d457f99842df19468193267e93ec3e4faa5be9602072a6aad69de0f1687a5f1ea57a93a4c',
      },
      {
        index: 5_000_000,
        address: '0x24dd12b9df5375f3b7fc5a539d4ac1bd2c16e9a0',
        publicKey:
          '0x04e2ddbc99b6e0f8fc4e62242e375a49a8d856d6865607db474d444d4b729e28e3c80172acc9473b8ba6eaa7c893864589df35ca10d42ca9937cd6c77768871374',
      },
    ],
  },

  // The BIP-32 specification test vectors.
  // https://github.com/bitcoin/bips/blob/f9a81b7791142e31ae9ab2a4e8c796f90cfe9627/bip-0032.mediawiki#test-vectors
  // The state of the default branch as of 2021-10-20
  bip32: [
    // ===Test vector 1===
    {
      hexSeed: '0x000102030405060708090a0b0c0d0e0f',
      keys: [
        {
          path: {
            ours: {
              tuple: [],
              string: '',
            },
            theirs: 'm',
          },
          extPubKey:
            'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8',
          extPrivKey:
            'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi',
          privateKey:
            '0xe8f32e723decf4051aefac8e2c93c9c5b214313817cdb01a1494b917c8436b35',
          publicKey:
            '0x0439a36013301597daef41fbe593a02cc513d0b55527ec2df1050e2e8ff49c85c23cbe7ded0e7ce6a594896b8f62888fdbc5c8821305e2ea42bf01e37300116281',
        },
        {
          path: {
            ours: {
              tuple: ["bip32:0'"],
              string: "bip32:0'",
            },
            theirs: "m/0'",
          },
          extPubKey:
            'xpub68Gmy5EdvgibQVfPdqkBBCHxA5htiqg55crXYuXoQRKfDBFA1WEjWgP6LHhwBZeNK1VTsfTFUHCdrfp1bgwQ9xv5ski8PX9rL2dZXvgGDnw',
          extPrivKey:
            'xprv9uHRZZhk6KAJC1avXpDAp4MDc3sQKNxDiPvvkX8Br5ngLNv1TxvUxt4cV1rGL5hj6KCesnDYUhd7oWgT11eZG7XnxHrnYeSvkzY7d2bhkJ7',
          privateKey:
            '0xedb2e14f9ee77d26dd93b4ecede8d16ed408ce149b6cd80b0715a2d911a0afea',
          publicKey:
            '0x045a784662a4a20a65bf6aab9ae98a6c068a81c52e4b032c0fb5400c706cfccc567f717885be239daadce76b568958305183ad616ff74ed4dc219a74c26d35f839',
        },
        {
          path: {
            ours: {
              tuple: ["bip32:0'", 'bip32:1'],
              string: "bip32:0'/bip32:1",
            },
            theirs: "m/0'/1",
          },
          extPubKey:
            'xpub6ASuArnXKPbfEwhqN6e3mwBcDTgzisQN1wXN9BJcM47sSikHjJf3UFHKkNAWbWMiGj7Wf5uMash7SyYq527Hqck2AxYysAA7xmALppuCkwQ',
          extPrivKey:
            'xprv9wTYmMFdV23N2TdNG573QoEsfRrWKQgWeibmLntzniatZvR9BmLnvSxqu53Kw1UmYPxLgboyZQaXwTCg8MSY3H2EU4pWcQDnRnrVA1xe8fs',
          privateKey:
            '0x3c6cb8d0f6a264c91ea8b5030fadaa8e538b020f0a387421a12de9319dc93368',
          publicKey:
            '0x04501e454bf00751f24b1b489aa925215d66af2234e3891c3b21a52bedb3cd711c008794c1df8131b9ad1e1359965b3f3ee2feef0866be693729772be14be881ab',
        },
        {
          path: {
            ours: {
              tuple: ["bip32:0'", 'bip32:1', "bip32:2'"],
              string: "bip32:0'/bip32:1/bip32:2'",
            },
            theirs: "m/0'/1/2'",
          },
          extPubKey:
            'xpub6D4BDPcP2GT577Vvch3R8wDkScZWzQzMMUm3PWbmWvVJrZwQY4VUNgqFJPMM3No2dFDFGTsxxpG5uJh7n7epu4trkrX7x7DogT5Uv6fcLW5',
          extPrivKey:
            'xprv9z4pot5VBttmtdRTWfWQmoH1taj2axGVzFqSb8C9xaxKymcFzXBDptWmT7FwuEzG3ryjH4ktypQSAewRiNMjANTtpgP4mLTj34bhnZX7UiM',
          privateKey:
            '0xcbce0d719ecf7431d88e6a89fa1483e02e35092af60c042b1df2ff59fa424dca',
          publicKey:
            '0x0457bfe1e341d01c69fe5654309956cbea516822fba8a601743a012a7896ee8dc24310ef3676384179e713be3115e93f34ac9a3933f6367aeb3081527ea74027b7',
        },
        {
          path: {
            ours: {
              tuple: ["bip32:0'", 'bip32:1', "bip32:2'", 'bip32:2'],
              string: "bip32:0'/bip32:1/bip32:2'/bip32:2",
            },
            theirs: "m/0'/1/2'/2",
          },
          extPubKey:
            'xpub6FHa3pjLCk84BayeJxFW2SP4XRrFd1JYnxeLeU8EqN3vDfZmbqBqaGJAyiLjTAwm6ZLRQUMv1ZACTj37sR62cfN7fe5JnJ7dh8zL4fiyLHV',
          extPrivKey:
            'xprvA2JDeKCSNNZky6uBCviVfJSKyQ1mDYahRjijr5idH2WwLsEd4Hsb2Tyh8RfQMuPh7f7RtyzTtdrbdqqsunu5Mm3wDvUAKRHSC34sJ7in334',
          privateKey:
            '0x0f479245fb19a38a1954c5c7c0ebab2f9bdfd96a17563ef28a6a4b1a2a764ef4',
          publicKey:
            '0x04e8445082a72f29b75ca48748a914df60622a609cacfce8ed0e35804560741d292728ad8d58a140050c1016e21f285636a580f4d2711b7fac3957a594ddf416a0',
        },
        {
          path: {
            ours: {
              tuple: [
                "bip32:0'",
                'bip32:1',
                "bip32:2'",
                'bip32:2',
                'bip32:1000000000',
              ],
              string: "bip32:0'/bip32:1/bip32:2'/bip32:2/bip32:1000000000",
            },
            theirs: "m/0'/1/2'/2/1000000000",
          },
          extPubKey:
            'xpub6H1LXWLaKsWFhvm6RVpEL9P4KfRZSW7abD2ttkWP3SSQvnyA8FSVqNTEcYFgJS2UaFcxupHiYkro49S8yGasTvXEYBVPamhGW6cFJodrTHy',
          extPrivKey:
            'xprvA41z7zogVVwxVSgdKUHDy1SKmdb533PjDz7J6N6mV6uS3ze1ai8FHa8kmHScGpWmj4WggLyQjgPie1rFSruoUihUZREPSL39UNdE3BBDu76',
          privateKey:
            '0x471b76e389e528d6de6d816857e012c5455051cad6660850e58372a6c3e6e7c8',
          publicKey:
            '0x042a471424da5e657499d1ff51cb43c47481a03b1e77f951fe64cec9f5a48f7011cf31cb47de7ccf6196d3a580d055837de7aa374e28c6c8a263e7b4512ceee362',
        },
      ],
    },

    // ===Test vector 2===
    {
      hexSeed:
        '0xfffcf9f6f3f0edeae7e4e1dedbd8d5d2cfccc9c6c3c0bdbab7b4b1aeaba8a5a29f9c999693908d8a8784817e7b7875726f6c696663605d5a5754514e4b484542',
      keys: [
        {
          path: {
            ours: {
              tuple: [],
              string: '',
            },
            theirs: 'm',
          },
          extPubKey:
            'xpub661MyMwAqRbcFW31YEwpkMuc5THy2PSt5bDMsktWQcFF8syAmRUapSCGu8ED9W6oDMSgv6Zz8idoc4a6mr8BDzTJY47LJhkJ8UB7WEGuduB',
          extPrivKey:
            'xprv9s21ZrQH143K31xYSDQpPDxsXRTUcvj2iNHm5NUtrGiGG5e2DtALGdso3pGz6ssrdK4PFmM8NSpSBHNqPqm55Qn3LqFtT2emdEXVYsCzC2U',
          privateKey:
            '0x4b03d6fc340455b363f51020ad3ecca4f0850280cf436c70c727923f6db46c3e',
          publicKey:
            '0x04cbcaa9c98c877a26977d00825c956a238e8dddfbd322cce4f74b0b5bd6ace4a77bd3305d363c26f82c1e41c667e4b3561c06c60a2104d2b548e6dd059056aa51',
        },
        {
          path: {
            ours: {
              tuple: ['bip32:0'],
              string: 'bip32:0',
            },
            theirs: 'm/0',
          },
          extPubKey:
            'xpub69H7F5d8KSRgmmdJg2KhpAK8SR3DjMwAdkxj3ZuxV27CprR9LgpeyGmXUbC6wb7ERfvrnKZjXoUmmDznezpbZb7ap6r1D3tgFxHmwMkQTPH',
          extPrivKey:
            'xprv9vHkqa6EV4sPZHYqZznhT2NPtPCjKuDKGY38FBWLvgaDx45zo9WQRUT3dKYnjwih2yJD9mkrocEZXo1ex8G81dwSM1fwqWpWkeS3v86pgKt',
          privateKey:
            '0xabe74a98f6c7eabee0428f53798f0ab8aa1bd37873999041703c742f15ac7e1e',
          publicKey:
            '0x04fc9e5af0ac8d9b3cecfe2a888e2117ba3d089d8585886c9c826b6b22a98d12ea67a50538b6f7d8b5f7a1cc657efd267cde8cc1d8c0451d1340a0fb3642777544',
        },
        {
          path: {
            ours: {
              tuple: ['bip32:0', "bip32:2147483647'"],
              string: "bip32:0/bip32:2147483647'",
            },
            theirs: "m/0/2147483647'",
          },
          extPubKey:
            'xpub6ASAVgeehLbnwdqV6UKMHVzgqAG8Gr6riv3Fxxpj8ksbH9ebxaEyBLZ85ySDhKiLDBrQSARLq1uNRts8RuJiHjaDMBU4Zn9h8LZNnBC5y4a',
          extPrivKey:
            'xprv9wSp6B7kry3Vj9m1zSnLvN3xH8RdsPP1Mh7fAaR7aRLcQMKTR2vidYEeEg2mUCTAwCd6vnxVrcjfy2kRgVsFawNzmjuHc2YmYRmagcEPdU9',
          privateKey:
            '0x877c779ad9687164e9c2f4f0f4ff0340814392330693ce95a58fe18fd52e6e93',
          publicKey:
            '0x04c01e7425647bdefa82b12d9bad5e3e6865bee0502694b94ca58b666abc0a5c3b6c8bf5e8fbfc053205b45776963d148187d0aebf9c08bf2b253dc1cf5860fc19',
        },
        {
          path: {
            ours: {
              tuple: ['bip32:0', "bip32:2147483647'", 'bip32:1'],
              string: "bip32:0/bip32:2147483647'/bip32:1",
            },
            theirs: "m/0/2147483647'/1",
          },
          extPubKey:
            'xpub6DF8uhdarytz3FWdA8TvFSvvAh8dP3283MY7p2V4SeE2wyWmG5mg5EwVvmdMVCQcoNJxGoWaU9DCWh89LojfZ537wTfunKau47EL2dhHKon',
          extPrivKey:
            'xprv9zFnWC6h2cLgpmSA46vutJzBcfJ8yaJGg8cX1e5StJh45BBciYTRXSd25UEPVuesF9yog62tGAQtHjXajPPdbRCHuWS6T8XA2ECKADdw4Ef',
          privateKey:
            '0x704addf544a06e5ee4bea37098463c23613da32020d604506da8c0518e1da4b7',
          publicKey:
            '0x04a7d1d856deb74c508e05031f9895dab54626251b3806e16b4bd12e781a7df5b9105b3150817d235e80ea17914dc9d6f542b1c5f4b16d8d98fe3c94fc0a67de89',
        },
        {
          path: {
            ours: {
              tuple: [
                'bip32:0',
                "bip32:2147483647'",
                'bip32:1',
                "bip32:2147483646'",
              ],
              string: "bip32:0/bip32:2147483647'/bip32:1/bip32:2147483646'",
            },
            theirs: "m/0/2147483647'/1/2147483646'",
          },
          extPubKey:
            'xpub6ERApfZwUNrhLCkDtcHTcxd75RbzS1ed54G1LkBUHQVHQKqhMkhgbmJbZRkrgZw4koxb5JaHWkY4ALHY2grBGRjaDMzQLcgJvLJuZZvRcEL',
          extPrivKey:
            'xprvA1RpRA33e1JQ7ifknakTFpgNXPmW2YvmhqLQYMmrj4xJXXWYpDPS3xz7iAxn8L39njGVyuoseXzU6rcxFLJ8HFsTjSyQbLYnMpCqE2VbFWc',
          privateKey:
            '0xf1c7c871a54a804afe328b4c83a1c33b8e5ff48f5087273f04efa83b247d6a2d',
          publicKey:
            '0x04d2b36900396c9282fa14628566582f206a5dd0bcc8d5e892611806cafb0301f0ecb53a1b24eda1117d6864f1dbaf2f92345a1cb52c70036e2a424b37c3d829b0',
        },
        {
          path: {
            ours: {
              tuple: [
                'bip32:0',
                "bip32:2147483647'",
                'bip32:1',
                "bip32:2147483646'",
                'bip32:2',
              ],
              string:
                "bip32:0/bip32:2147483647'/bip32:1/bip32:2147483646'/bip32:2",
            },
            theirs: "m/0/2147483647'/1/2147483646'/2",
          },
          extPubKey:
            'xpub6FnCn6nSzZAw5Tw7cgR9bi15UV96gLZhjDstkXXxvCLsUXBGXPdSnLFbdpq8p9HmGsApME5hQTZ3emM2rnY5agb9rXpVGyy3bdW6EEgAtqt',
          extPrivKey:
            'xprvA2nrNbFZABcdryreWet9Ea4LvTJcGsqrMzxHx98MMrotbir7yrKCEXw7nadnHM8Dq38EGfSh6dqA9QWTyefMLEcBYJUuekgW4BYPJcr9E7j',
          privateKey:
            '0xbb7d39bdb83ecf58f2fd82b6d918341cbef428661ef01ab97c28a4842125ac23',
          publicKey:
            '0x044d902e1a2fc7a8755ab5b694c575fce742c48d9ff192e63df5193e4c7afe1f9c4597bb130cb16893607c6e7418c46be47b8f4a3ddbe5e6e71051393b1d673abe',
        },
      ],
    },

    // ===Test vector 3===
    // These vectors test for the retention of leading zeros. For more information, see: https://github.com/bitpay/bitcore-lib/issues/47 and https://github.com/iancoleman/bip39/issues/58
    {
      hexSeed:
        '0x4b381541583be4423346c643850da4b320e46a87ae3d2a4e6da11eba819cd4acba45d239319ac14f863b8d5ab5a0d0c64d2e8a1e7d1457df2e5a3c51c73235be',
      keys: [
        {
          path: {
            ours: {
              tuple: [],
              string: '',
            },
            theirs: 'm',
          },
          extPubKey:
            'xpub661MyMwAqRbcEZVB4dScxMAdx6d4nFc9nvyvH3v4gJL378CSRZiYmhRoP7mBy6gSPSCYk6SzXPTf3ND1cZAceL7SfJ1Z3GC8vBgp2epUt13',
          extPrivKey:
            'xprv9s21ZrQH143K25QhxbucbDDuQ4naNntJRi4KUfWT7xo4EKsHt2QJDu7KXp1A3u7Bi1j8ph3EGsZ9Xvz9dGuVrtHHs7pXeTzjuxBrCmmhgC6',
          privateKey:
            '0x00ddb80b067e0d4993197fe10f2657a844a384589847602d56f0c629c81aae32',
          publicKey:
            '0x04683af1ba5743bdfc798cf814efeeab2735ec52d95eced528e692b8e34c4e5669d2f2686ced96d375a75298f07ed30751e2a3f45e2d184b268d02c8d5dd6fbdb5',
        },
        {
          path: {
            ours: {
              tuple: ["bip32:0'"],
              string: "bip32:0'",
            },
            theirs: "m/0'",
          },
          extPubKey:
            'xpub68NZiKmJWnxxS6aaHmn81bvJeTESw724CRDs6HbuccFQN9Ku14VQrADWgqbhhTHBaohPX4CjNLf9fq9MYo6oDaPPLPxSb7gwQN3ih19Zm4Y',
          extPrivKey:
            'xprv9uPDJpEQgRQfDcW7BkF7eTya6RPxXeJCqCJGHuCJ4GiRVLzkTXBAJMu2qaMWPrS7AANYqdq6vcBcBUdJCVVFceUvJFjaPdGZ2y9WACViL4L',
          privateKey:
            '0x491f7a2eebc7b57028e0d3faa0acda02e75c33b03c48fb288c41e2ea44e1daef',
          publicKey:
            '0x046557fdda1d5d43d79611f784780471f086d58e8126b8c40acb82272a7712e7f259a34ffdc4c82e5cb68a96ccc6cb53e8765527148d1a85b52dfb8953d8d001fc',
        },
      ],
    },

    // ===Test vector 4===
    // These vectors test for the retention of leading zeros. For more information, see: https://github.com/btcsuite/btcutil/issues/172 btcsuite/btcutil#172
    {
      hexSeed:
        '0x3ddd5602285899a946114506157c7997e5444528f3003f6134712147db19b678',
      keys: [
        {
          path: {
            ours: {
              tuple: [],
              string: '',
            },
            theirs: 'm',
          },
          extPubKey:
            'xpub661MyMwAqRbcGczjuMoRm6dXaLDEhW1u34gKenbeYqAix21mdUKJyuyu5F1rzYGVxyL6tmgBUAEPrEz92mBXjByMRiJdba9wpnN37RLLAXa',
          extPrivKey:
            'xprv9s21ZrQH143K48vGoLGRPxgo2JNkJ3J3fqkirQC2zVdk5Dgd5w14S7fRDyHH4dWNHUgkvsvNDCkvAwcSHNAQwhwgNMgZhLtQC63zxwhQmRv',
          privateKey:
            '0x12c0d59c7aa3a10973dbd3f478b65f2516627e3fe61e00c345be9a477ad2e215',
          publicKey:
            '0x046f6fedc9240f61daa9c7144b682a430a3a1366576f840bf2d070101fcbc9a02d64f0ba4512324da4cb12cd1b7b09a3410ad2e88fa9c51067528b4a21edd1c820',
        },
        {
          path: {
            ours: {
              tuple: ["bip32:0'"],
              string: "bip32:0'",
            },
            theirs: "m/0'",
          },
          extPubKey:
            'xpub69AUMk3qDBi3uW1sXgjCmVjJ2G6WQoYSnNHyzkmdCHEhSZ4tBok37xfFEqHd2AddP56Tqp4o56AePAgCjYdvpW2PU2jbUPFKsav5ut6Ch1m',
          extPrivKey:
            'xprv9vB7xEWwNp9kh1wQRfCCQMnZUEG21LpbR9NPCNN1dwhiZkjjeGRnaALmPXCX7SgjFTiCTT6bXes17boXtjq3xLpcDjzEuGLQBM5ohqkao9G',
          privateKey:
            '0x00d948e9261e41362a688b916f297121ba6bfb2274a3575ac0e456551dfd7f7e',
          publicKey:
            '0x049382d2b6003446792d2917f7ac4b3edf079a1a94dd4eb010dc25109dda680a9d2ea33616de0b194f4c2a246ecefaff985c15671b7600d9d06ba4d658a280a1a7',
        },
        {
          path: {
            ours: {
              tuple: ["bip32:0'", "bip32:1'"],
              string: "bip32:0'/bip32:1'",
            },
            theirs: "m/0'/1'",
          },
          extPubKey:
            'xpub6BJA1jSqiukeaesWfxe6sNK9CCGaujFFSJLomWHprUL9DePQ4JDkM5d88n49sMGJxrhpjazuXYWdMf17C9T5XnxkopaeS7jGk1GyyVziaMt',
          extPrivKey:
            'xprv9xJocDuwtYCMNAo3Zw76WENQeAS6WGXQ55RCy7tDJ8oALr4FWkuVoHJeHVAcAqiZLE7Je3vZJHxspZdFHfnBEjHqU5hG1Jaj32dVoS6XLT1',
          privateKey:
            '0x3a2086edd7d9df86c3487a5905a1712a9aa664bce8cc268141e07549eaa8661d',
          publicKey:
            '0x042edaf9e591ee27f3c69c36221e3c54c38088ef34e93fbb9bb2d4d9b92364cbbd9fa61aa41b9e4a7ced425e125d074537314b7adfe59c2f98049ca763dbc0e613',
        },
      ],
    },
  ],
  cip3: [
    {
      // taken from CIP-03 test vectors https://github.com/cardano-foundation/CIPs/blob/09d7d8ee1bd64f7e6b20b5a6cae088039dce00cb/CIP-0003/Icarus.md#test-vectors
      mnemonic:
        'eight country switch draw meat scout mystery blade tip drift useless good keep usage title',
      entropyHex: '46e62370a138a182a498b8e2885bc032379ddf38',
      derivationPath: [`1852'`, `1815'`, `0'`, `0`, `0`],
      nodes: {
        bip39Node: {
          depth: 0,
          masterFingerprint: 1247889873,
          parentFingerprint: 0,
          index: 0,
          network: 'mainnet',
          curve: 'ed25519Bip32',
          privateKey:
            '0xc065afd2832cd8b087c4d9ab7011f481ee1e0721e78ea5dd609f3ab3f156d245d176bd8fd4ec60b4731c3918a2a72a0226c0cd119ec35b47e4d55884667f552a',
          publicKey:
            '0x757e95578798ef733ad93be322fb043053d56b445d3fe502bcf7cb4a6b0f0c6a',
          chainCode:
            '0x23f7fdcd4a10c6cd2c7393ac61d877873e248f417634aa3d812af327ffe9d620',
        },
        // rest of the nodes generated using cardano-serialization-lib
        // https://gist.github.com/PeterBenc/342ded2c787b8140912076c7e210e3db
        purposeNode: {
          depth: 1,
          masterFingerprint: 1247889873,
          parentFingerprint: 1247889873,
          index: 2147485500,
          network: 'mainnet',
          curve: 'ed25519Bip32',
          privateKey:
            '0x98f25c3313e03b7843072514c5f024782072406b37569403423d2361f356d2459ecc73a09adb2aa37e9f8530fd1e6745eee1ea248a85417a700e774182c7fa3d',
          publicKey:
            '0xd4674357f268cdb95e6b6f3c6eb2fe32f3b59932acbd1baddea4320005225d66',
          chainCode:
            '0x864cf884b7faf31f33733e6fc900d4446394d8d6ee55610473ef24c6bb3fb91f',
        },
        coinTypeNode: {
          depth: 2,
          masterFingerprint: 1247889873,
          parentFingerprint: 186342781,
          index: 2147485463,
          network: 'mainnet',
          curve: 'ed25519Bip32',
          privateKey:
            '0x504e9dc3ed6d22231a0e43cd250fcda7757b42aa9affae5f20dea1fef956d2450cc3d2abd5b6a6626d73d789a6ad77cd0e5d92e093dc5a1484c71e4f996f495e',
          publicKey:
            '0x9490b1415b20f286a76092d5b091f8240c169cbe5fd0695b66fbf43934ec6461',
          chainCode:
            '0xb84879a6adef2f9d283e8a1815cfb946ee5ce70873632097bb723ac2565d8002',
        },
        accountNode: {
          depth: 3,
          masterFingerprint: 1247889873,
          parentFingerprint: 1372272135,
          index: 2147483648,
          network: 'mainnet',
          curve: 'ed25519Bip32',
          privateKey:
            '0xf80081fa05eece83236e612463aafad20d6b92eee67479a1977959540057d2452173fe9a0fccf61cf2cc7c52638f2ded6c08002a71424ca5b93681ee7a385828',
          publicKey:
            '0x7f376415131590bf8cc88e8466fd24a6f95eebd6c2271d89cb51a81402618c9b',
          chainCode:
            '0x332b13689518700be3c6d330d72490c42e8a98b7495889a27851e543319fb095',
        },
        changeNode: {
          depth: 4,
          masterFingerprint: 1247889873,
          parentFingerprint: 3705424019,
          index: 0,
          network: 'mainnet',
          curve: 'ed25519Bip32',
          privateKey:
            '0x00b5105515ee89a7718c0bdbe05c9613a17a5907f5943dacfde9802f0157d2458bddfc042979fb8b30cb13437edc7ec7c1836676e063780d5db0b8ae84babe4e',
          publicKey:
            '0x4fc838b965349324a94379b4fe9ec2319c6574f30ac55c8e4e76de55f2981296',
          chainCode:
            '0x47b1b5663a3bddf78d9698ca580263af68a907eed0dd6421ef2daf62c20d61b9',
        },
        addressIndexNode: {
          depth: 5,
          masterFingerprint: 1247889873,
          parentFingerprint: 3669962052,
          index: 0,
          network: 'mainnet',
          curve: 'ed25519Bip32',
          privateKey:
            '0x00df3ecf0e02979dd9ee569d09412c1f370f476054aaa1ef3cf5a08c0557d245a6ad0fe81ab55e36178f5866dc8f83cf57239fdeee35c737ef887964aae20500',
          publicKey:
            '0xcc9809944150c00f3913cd2b103e9b42fe6243fc36a76f9eb800692e2bda3f2e',
          chainCode:
            '0x2b2dd0a9b83141f6650c40abec9ed52ecaa6a567825cb2c7a14b9452bca0c020',
        },
      },
    },
    {
      // fixture for 24-word mnemonic since trezor implementation of mnemonic to entropy for cardano had a bug that manifested only for 24 word mnemonics and it caused trezor to deviate
      // https://github.com/cardano-foundation/CIPs/blob/master/CIP-0003/Icarus.md#trezor
      // note that this test case has different result since we do not deviate from the standard
      // https://github.com/trezor/trezor-firmware/pull/1388/files#diff-17c19a8d23037f23062138997edf774fde43ab9dfbf7726d1f701edb6a2f133eR105
      mnemonic:
        'balance exotic ranch knife glory slow tape favorite yard gym awake ill exist useless parent aim pig stay effort into square gasp credit butter',
      entropyHex:
        '11aa02c63dd639987772a0fecd0040b874fde028082aa49a9d1abaed36c04cc0',
      derivationPath: [`1852'`, `1815'`, `0'`, `0`, `0`],
      nodes: {
        bip39Node: {
          depth: 0,
          masterFingerprint: 2293781934,
          parentFingerprint: 0,
          index: 0,
          curve: 'ed25519Bip32',
          privateKey:
            '0xe04d93999044f13fb435c6db11798e60e14064ebebcf563163e12331738c7748024836e762355f74ce59ef15e0af7ad50e6978a412543ab0bbc3a38451852206',
          publicKey:
            '0x3478b7d11022ab519ae6f1747d8078eb07740903fe1f7aff5909292ae39177f5',
          chainCode:
            '0x88f086ca813a0ce774983cfb6c88611996b2571ae2f1da894ca2fd639218d7c1',
        },
        // rest of the nodes generated using cardano-serialization-lib
        // https://gist.github.com/PeterBenc/342ded2c787b8140912076c7e210e3db
        purposeNode: {
          depth: 1,
          masterFingerprint: 2293781934,
          parentFingerprint: 2293781934,
          index: 2147485500,
          network: 'mainnet',
          curve: 'ed25519Bip32',
          privateKey:
            '0x305c7df2d77b116892dd47019a0913ad0769216e16b73d0fca6088dd748c774843861f9f2a07aff8e51c7807d92bc6ee432154a992227c0df2821d96c3a2763d',
          publicKey:
            '0x5a067a7fdfb79a5160b5a1b3d297e035ef193a9b464b08bfacbaab08b0798cb2',
          chainCode:
            '0xf13851cc3517cb6b3603ce00a7570c50f41c2c4d20edbfcdee160190f1ef9362',
        },
        coinTypeNode: {
          depth: 2,
          masterFingerprint: 2293781934,
          parentFingerprint: 2022252320,
          index: 2147485463,
          network: 'mainnet',
          curve: 'ed25519Bip32',
          privateKey:
            '0xd08b653d6f960079db25f38e8428f7f2891bd1c92b63ad7e0015265c768c77485bf55f8ccbb0a7188ebafcbd30219300ce3b86f54b11e236961efc814688810e',
          publicKey:
            '0x18bd1deaaa518b0ea46669c54c51606d505555ffc4cc6592f4bc57b41653e118',
          chainCode:
            '0xeb6b4805fa0f23448e20cdbb15b977cb908f4c744c0a2c0c4ee78608190d5e8a',
        },
        accountNode: {
          depth: 3,
          masterFingerprint: 2293781934,
          parentFingerprint: 3388798503,
          index: 2147483648,
          network: 'mainnet',
          curve: 'ed25519Bip32',
          privateKey:
            '0xe81381a5e59e98dc7eaffecc83d918ad8331938eedf3429d7d29dbfa768c774899268aba2b299d9513de3a33c134fedd19d209701456fe86757c9f64230c010f',
          publicKey:
            '0xce43a6e8929052830856bb58c132e5fe32c2f95697edd700a549c0bb3bf47d6f',
          chainCode:
            '0xa83a29374a48f18c8a423a34eb1c34dabe72b74669776999b9e87ff6bb48df7a',
        },
        changeNode: {
          depth: 4,
          masterFingerprint: 2293781934,
          parentFingerprint: 2105312604,
          index: 0,
          network: 'mainnet',
          curve: 'ed25519Bip32',
          privateKey:
            '0x5049005d5a97d5ea60753fb511460079a56b9981bc2e75f05e40dd46788c7748d664152bff95f76efdd0052643eb096eea6f18b6793365563bcaa12b3aa04fed',
          publicKey:
            '0xd756d64d9accf0a209bd7f1d2bd23500038191ff90635554fc05bff5ddd940bf',
          chainCode:
            '0x9534f22f806433f52d280508d89943cec05685072bbc82fa714e0d55f23f17fd',
        },
        addressIndexNode: {
          depth: 5,
          masterFingerprint: 2293781934,
          parentFingerprint: 2627281642,
          index: 0,
          network: 'mainnet',
          curve: 'ed25519Bip32',
          privateKey:
            '0xf0e6e40de5b8ae0d9c48f8ce7f829231aff420d792ff995dc56040f97b8c7748377ede2ad5468ce8103d2f3af977bb081c3c6aba76b36b72e56a7ba38559224d',
          publicKey:
            '0x40c5df588f7f2d3ccd51947dc3f9add61bb0e315d8f392a8bdce5587590bd21b',
          chainCode:
            '0x329c850f00e15cfa47ee8b74154c8a545fb8af4557586de29a9cd0ae72325b2f',
        },
      },
    },
  ],

  // The BIP-32 specification invalid extended key test vectors.
  // https://github.com/bitcoin/bips/blob/a3a397c82384220fc871852c809f73898a4d547c/bip-0032.mediawiki#test-vector-5
  // The state of the default branch as of 2023-03-06.
  bip32InvalidExtendedKeys: [
    'xpub661MyMwAqRbcEYS8w7XLSVeEsBXy79zSzH1J8vCdxAZningWLdN3zgtU6LBpB85b3D2yc8sfvZU521AAwdZafEz7mnzBBsz4wKY5fTtTQBm',
    'xprv9s21ZrQH143K24Mfq5zL5MhWK9hUhhGbd45hLXo2Pq2oqzMMo63oStZzFGTQQD3dC4H2D5GBj7vWvSQaaBv5cxi9gafk7NF3pnBju6dwKvH',
    'xpub661MyMwAqRbcEYS8w7XLSVeEsBXy79zSzH1J8vCdxAZningWLdN3zgtU6Txnt3siSujt9RCVYsx4qHZGc62TG4McvMGcAUjeuwZdduYEvFn',
    'xprv9s21ZrQH143K24Mfq5zL5MhWK9hUhhGbd45hLXo2Pq2oqzMMo63oStZzFGpWnsj83BHtEy5Zt8CcDr1UiRXuWCmTQLxEK9vbz5gPstX92JQ',
    'xpub661MyMwAqRbcEYS8w7XLSVeEsBXy79zSzH1J8vCdxAZningWLdN3zgtU6N8ZMMXctdiCjxTNq964yKkwrkBJJwpzZS4HS2fxvyYUA4q2Xe4',
    'xprv9s21ZrQH143K24Mfq5zL5MhWK9hUhhGbd45hLXo2Pq2oqzMMo63oStZzFAzHGBP2UuGCqWLTAPLcMtD9y5gkZ6Eq3Rjuahrv17fEQ3Qen6J',
    'xprv9s2SPatNQ9Vc6GTbVMFPFo7jsaZySyzk7L8n2uqKXJen3KUmvQNTuLh3fhZMBoG3G4ZW1N2kZuHEPY53qmbZzCHshoQnNf4GvELZfqTUrcv',
    'xpub661no6RGEX3uJkY4bNnPcw4URcQTrSibUZ4NqJEw5eBkv7ovTwgiT91XX27VbEXGENhYRCf7hyEbWrR3FewATdCEebj6znwMfQkhRYHRLpJ',
    'xprv9s21ZrQH4r4TsiLvyLXqM9P7k1K3EYhA1kkD6xuquB5i39AU8KF42acDyL3qsDbU9NmZn6MsGSUYZEsuoePmjzsB3eFKSUEh3Gu1N3cqVUN',
    'xpub661MyMwAuDcm6CRQ5N4qiHKrJ39Xe1R1NyfouMKTTWcguwVcfrZJaNvhpebzGerh7gucBvzEQWRugZDuDXjNDRmXzSZe4c7mnTK97pTvGS8',
    'DMwo58pR1QLEFihHiXPVykYB6fJmsTeHvyTp7hRThAtCX8CvYzgPcn8XnmdfHGMQzT7ayAmfo4z3gY5KfbrZWZ6St24UVf2Qgo6oujFktLHdHY4',
    'DMwo58pR1QLEFihHiXPVykYB6fJmsTeHvyTp7hRThAtCX8CvYzgPcn8XnmdfHPmHJiEDXkTiJTVV9rHEBUem2mwVbbNfvT2MTcAqj3nesx8uBf9',
    'xprv9s21ZrQH143K24Mfq5zL5MhWK9hUhhGbd45hLXo2Pq2oqzMMo63oStZzF93Y5wvzdUayhgkkFoicQZcP3y52uPPxFnfoLZB21Teqt1VvEHx',
    'xprv9s21ZrQH143K24Mfq5zL5MhWK9hUhhGbd45hLXo2Pq2oqzMMo63oStZzFAzHGBP2UuGCqWLTAPLcMtD5SDKr24z3aiUvKr9bJpdrcLg1y3G',
    'xpub661MyMwAqRbcEYS8w7XLSVeEsBXy79zSzH1J8vCdxAZningWLdN3zgtU6Q5JXayek4PRsn35jii4veMimro1xefsM58PgBMrvdYre8QyULY',
    'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHL',
  ],

  // https://github.com/cryptocoinjs/secp256k1-node/blob/f73cd3a2b95ec6f549a2feabfbf2b8f17b30dcc7/test/privatekey.js
  // The state of the default branch as of 2022-03-10
  // Fixtures generated by running the tests and logging the (pseudo-)randomly generated private key
  // and tweak.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  'secp256k1-node': {
    privateAdd: [
      {
        privateKey:
          '0x0000000000000000000000000000000000000000000000000000000000000001',
        tweak:
          '0x0000000000000000000000000000000000000000000000000000000000000001',
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000002',
      },
      {
        privateKey:
          '0x8b147e947559e2a1598f6f0c334512a318a17e2f7992110448f33e42b365c2b6',
        tweak:
          '0xe6a9bdd2ccbccdf4c65472338459df8888cc77fbf4ffcd0b9c35e36a68b24ae9',
        result:
          '0x71be3c674216b0961fe3e13fb79ef22ce6bf1944bf493dd42556c3204be1cc5e',
      },
      {
        privateKey:
          '0x28ae78e8c4674af70102b7ed86156e2563e5d53011f3cbd86c302d7a927b4a2d',
        tweak:
          '0x116f2e9181d755d41ffe6b01f0bf2ddf45ca3300acb8dea7a8b436ebdc166207',
        result:
          '0x3a1da77a463ea0cb210122ef76d49c04a9b00830beacaa8014e464666e91ac34',
      },
      {
        privateKey:
          '0xa03f6d00fde0ae947746099de9d8038558879fb074a7bf8912366f377e227d8b',
        tweak:
          '0xe09c82be0eb3d7e8c1f22387b412b324805e17ffbc42beddfb4e498723a26ac8',
        result:
          '0x80dbefbf0c94867d39382d259deab6ab1e36dac981a1de2b4db25a31d18ea712',
      },
      {
        privateKey:
          '0x81f0934c5b1e2ba3d3f929eb8b5a5b0afbb3e1ac73020644327d19464e14453f',
        tweak:
          '0x7bce175ad49a5824ac09d0ef1ce66099a2a55bcdf89438283f69d86e60144af1',
        result:
          '0xfdbeaaa72fb883c88002fadaa840bba49e593d7a6b963e6c71e6f1b4ae289030',
      },
      {
        privateKey:
          '0xfca181aa616897c330c1847dc0e10400016ebef97f43ecf593cd5ef7c4f105b7',
        tweak:
          '0x33b0309878b3100d4b7652361e0efe72a482a7a5009d3ce7f5fd069db81540a0',
        result:
          '0x3051b242da1ba7d07c37d6b3def00273eb4289b7d09889a1c9f80708acd00516',
      },
    ],
  },

  ed25519: {
    // https://github.com/satoshilabs/slips/blob/b17cfb61666c3e475003391dc314c6794fb27e33/slip-0010.md#test-vector-1-for-ed25519
    // The state of the default branch as of 2022-03-17
    slip10: [
      {
        hexSeed: '0x000102030405060708090a0b0c0d0e0f',
        keys: [
          {
            path: {
              ours: {
                tuple: [],
                string: '',
              },
              theirs: 'm',
            },
            privateKey:
              '0x2b4be7f19ee27bbf30c667b642d5f4aa69fd169872f8fc3059c08ebae2eb19e7',
            publicKey:
              '0x00a4b2856bfec510abab89753fac1ac0e1112364e7d250545963f135f2a33188ed',
          },
          {
            path: {
              ours: {
                tuple: [`slip10:0'`],
                string: `slip10:0'`,
              },
              theirs: `m/0'`,
            },
            privateKey:
              '0x68e0fe46dfb67e368c75379acec591dad19df3cde26e63b93a8e704f1dade7a3',
            publicKey:
              '0x008c8a13df77a28f3445213a0f432fde644acaa215fc72dcdf300d5efaa85d350c',
          },
          {
            path: {
              ours: {
                tuple: [`slip10:0'`, `slip10:1'`],
                string: `slip10:0'/slip10:1'`,
              },
              theirs: `m/0'/1'`,
            },
            privateKey:
              '0xb1d0bad404bf35da785a64ca1ac54b2617211d2777696fbffaf208f746ae84f2',
            publicKey:
              '0x001932a5270f335bed617d5b935c80aedb1a35bd9fc1e31acafd5372c30f5c1187',
          },
          {
            path: {
              ours: {
                tuple: [`slip10:0'`, `slip10:1'`, `slip10:2'`],
                string: `slip10:0'/slip10:1'/slip10:2'`,
              },
              theirs: `m/0'/1'/2'`,
            },
            privateKey:
              '0x92a5b23c0b8a99e37d07df3fb9966917f5d06e02ddbd909c7e184371463e9fc9',
            publicKey:
              '0x00ae98736566d30ed0e9d2f4486a64bc95740d89c7db33f52121f8ea8f76ff0fc1',
          },
          {
            path: {
              ours: {
                tuple: [`slip10:0'`, `slip10:1'`, `slip10:2'`, `slip10:2'`],
                string: `slip10:0'/slip10:1'/slip10:2'/slip10:2'`,
              },
              theirs: `m/0'/1'/2'/2'`,
            },
            privateKey:
              '0x30d1dc7e5fc04c31219ab25a27ae00b50f6fd66622f6e9c913253d6511d1e662',
            publicKey:
              '0x008abae2d66361c879b900d204ad2cc4984fa2aa344dd7ddc46007329ac76c429c',
          },
          {
            path: {
              ours: {
                tuple: [
                  `slip10:0'`,
                  `slip10:1'`,
                  `slip10:2'`,
                  `slip10:2'`,
                  `slip10:1000000000'`,
                ],
                string: `slip10:0'/slip10:1'/slip10:2'/slip10:2'/slip10:1000000000'`,
              },
              theirs: `m/0'/1'/2'/2'/1000000000'`,
            },
            privateKey:
              '0x8f94d394a8e8fd6b1bc2f3f49f5c47e385281d5c17e65324b0f62483e37e8793',
            publicKey:
              '0x003c24da049451555d51a7014a37337aa4e12d41e485abccfa46b47dfb2af54b7a',
          },
        ],
      },
      {
        hexSeed:
          '0xfffcf9f6f3f0edeae7e4e1dedbd8d5d2cfccc9c6c3c0bdbab7b4b1aeaba8a5a29f9c999693908d8a8784817e7b7875726f6c696663605d5a5754514e4b484542',
        keys: [
          {
            path: {
              ours: {
                tuple: [],
                string: '',
              },
              theirs: 'm',
            },
            privateKey:
              '0x171cb88b1b3c1db25add599712e36245d75bc65a1a5c9e18d76f9f2b1eab4012',
            publicKey:
              '0x008fe9693f8fa62a4305a140b9764c5ee01e455963744fe18204b4fb948249308a',
          },
          {
            path: {
              ours: {
                tuple: [`slip10:0'`],
                string: `slip10:0'`,
              },
              theirs: `m/0'`,
            },
            privateKey:
              '0x1559eb2bbec5790b0c65d8693e4d0875b1747f4970ae8b650486ed7470845635',
            publicKey:
              '0x0086fab68dcb57aa196c77c5f264f215a112c22a912c10d123b0d03c3c28ef1037',
          },
          {
            path: {
              ours: {
                tuple: [`slip10:0'`, `slip10:2147483647'`],
                string: `slip10:0'/slip10:2147483647'`,
              },
              theirs: `m/0'/2147483647'`,
            },
            privateKey:
              '0xea4f5bfe8694d8bb74b7b59404632fd5968b774ed545e810de9c32a4fb4192f4',
            publicKey:
              '0x005ba3b9ac6e90e83effcd25ac4e58a1365a9e35a3d3ae5eb07b9e4d90bcf7506d',
          },
          {
            path: {
              ours: {
                tuple: [`slip10:0'`, `slip10:2147483647'`, `slip10:1'`],
                string: `slip10:0'/slip10:2147483647'/slip10:1'`,
              },
              theirs: `m/0'/2147483647'/1'`,
            },
            privateKey:
              '0x3757c7577170179c7868353ada796c839135b3d30554bbb74a4b1e4a5a58505c',
            publicKey:
              '0x002e66aa57069c86cc18249aecf5cb5a9cebbfd6fadeab056254763874a9352b45',
          },
          {
            path: {
              ours: {
                tuple: [
                  `slip10:0'`,
                  `slip10:2147483647'`,
                  `slip10:1'`,
                  `slip10:2147483646'`,
                ],
                string: `slip10:0'/slip10:2147483647'/slip10:1'/slip10:2147483646'`,
              },
              theirs: `m/0'/2147483647'/1'/2147483646'`,
            },
            privateKey:
              '0x5837736c89570de861ebc173b1086da4f505d4adb387c6a1b1342d5e4ac9ec72',
            publicKey:
              '0x00e33c0f7d81d843c572275f287498e8d408654fdf0d1e065b84e2e6f157aab09b',
          },
          {
            path: {
              ours: {
                tuple: [
                  `slip10:0'`,
                  `slip10:2147483647'`,
                  `slip10:1'`,
                  `slip10:2147483646'`,
                  `slip10:2'`,
                ],
                string: `slip10:0'/slip10:2147483647'/slip10:1'/slip10:2147483646'/slip10:2'`,
              },
              theirs: `m/0'/2147483647'/1'/2147483646'/2'`,
            },
            privateKey:
              '0x551d333177df541ad876a60ea71f00447931c0a9da16f227c11ea080d7391b8d',
            publicKey:
              '0x0047150c75db263559a70d5778bf36abbab30fb061ad69f69ece61a72b0cfa4fc0',
          },
        ],
      },
    ],

    // https://github.com/alepop/ed25519-hd-key/tree/d8c0491bc39e197c86816973e80faab54b9cbc26
    // The state of the default branch as of 2021-10-19
    // Fixtures generated by running the tests and logging the results.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    'ed25519-hd-key': {
      hexSeed:
        '0xfffcf9f6f3f0edeae7e4e1dedbd8d5d2cfccc9c6c3c0bdbab7b4b1aeaba8a5a29f9c999693908d8a8784817e7b7875726f6c696663605d5a5754514e4b484542',
      privateKey:
        '0xd3de0cf6f12d2c916530a9871c16d0429f3f0152e22e260527a4769fddc1bba8',
      // The path used is modified from the ed25519-hd-key original, which
      // isn't BIP-44 compatible. Since we're testing against their
      // implementation, not any reference values, this is fine.
      path: {
        ours: {
          tuple: [`slip10:44'`, `slip10:0'`, `slip10:0'`, `slip10:1'`],
          string: [`slip10:44'/slip10:0'/slip10:0'/slip10:1'`],
        },
        theirs: `m/44'/0'/0'/1'`,
      },
      sampleKeyIndices: [
        {
          index: 0,
          privateKey:
            '0x5ff1d76d708c8db54ded88f0f00fd60105d609beb029f50b1051117ca36a61e1',
          publicKey:
            '0x001fd3196b4db863989445c760c9e65de4ce5cebdada0e4ead00e9be44a99ea7f3',
        },
        {
          index: 1,
          privateKey:
            '0x1ae261442406e5f4e87efac331bce3a25016957133ada46d82579c11e6108fc3',
          publicKey:
            '0x009ae7a413c01359fe1d525ca446ebc974c97e535061564da577c6ef55c09d057e',
        },
        {
          index: 5,
          privateKey:
            '0x344d6bc78531985dd4220faa61bfb81653043e171f64d01c36de5a0ef39f9ede',
          publicKey:
            '0x000ab89e1f22d9162e0e3f02736d5c704c95faba6ce2dce72d121852172da4b1e4',
        },
        {
          index: 50,
          privateKey:
            '0x3468ee8024444e88781b2a5c92973ec965f43f8715414bac3e1b7f46589f41d5',
          publicKey:
            '0x00fd4f06acb57dba0c1cffc12e9241d4f9c5afebce724b1b84124e99dbeeb63ae9',
        },
        {
          index: 500,
          privateKey:
            '0x557676494a3b1309487dd990e12ccb22a0c3195ba696afdc96a48b65171f804d',
          publicKey:
            '0x00ee6fb077beb5bd25db75bed73fa3e0e6fa1a1a4a3b912c84722afdfe2c0cabfe',
        },
        {
          index: 5000,
          privateKey:
            '0x5f0df48ccabf174f49a74ec14b518933b7b939f45ace2a4858d0038dfa5ed8dc',
          publicKey:
            '0x00ec36e172507304eebaeb451aaf329f1d6da7b77501a33e2cfa6700bd5bf0815f',
        },
        {
          index: 4_999_999,
          privateKey:
            '0x5e65e057d8324c547ba3fe5eec1ae627c503ea6001dca3f2c077bb9d673d0fbf',
          publicKey:
            '0x009dc2f2dc4434dd8fd7c9728ca7d55c3f15f679da8fd6522d6b514f20d8f27c21',
        },
        {
          index: 5_000_000,
          privateKey:
            '0x759d3e66b20d6f057d1e0873e26430cdce67d0dfc160ecfe36acefe58ec1cb48',
          publicKey:
            '0x005cb94d2247fc84176fe7a43a7ce530b1064642acaf3fb61987c22f8638acf2d8',
        },
      ],
    },
  },

  // These vectors test the error handling behaviour, when an invalid private
  // key is derived. The actual chance of this happening is extremely low, so
  // these values are generated using mock return values: The first call to
  // `isValidPrivateKey` returns `false`, and any subsequent calls return
  // `true`.
  errorHandling: {
    bip32: {
      hexSeed:
        '0x747f302d9c916698912d5f70be53a6cf53bc495803a5523d3a7c3afa2afba94ec3803f838b3e1929ab5481f9da35441372283690fdcf27372c38f40ba134fe03',
      keys: [
        {
          path: {
            ours: {
              tuple: [`bip32:3`],
              string: `bip32:3`,
            },
            theirs: `m/3`,
          },
          privateKey:
            '0x4f1502ee43a67a8eae936df0eb9fd7c4cc11c4c4d76cdeb4efb2711319636500',
          chainCode:
            '0x576063b42e8e274ceb0a4d5aa2d6eac96334c526634daa7aaf0b44775a08e54e',
          depth: 1,
          index: 4,
        },
        {
          path: {
            ours: {
              tuple: [`bip32:3`, `bip32:0`],
              string: `bip32:3/bip32:0`,
            },
            theirs: `m/3/0`,
          },
          privateKey:
            '0xc54cdf5ee9a8504000b09334c5085513a380f6b30bb5ea5a944bc44e8a720890',
          chainCode:
            '0x9018faed4ffcfd70528920a78aef034c76a5c65d9fee0b85ab9d93af2f650b8f',
          depth: 2,
          index: 0,
        },
        {
          path: {
            ours: {
              tuple: [`bip32:123'`],
              string: `bip32:123'`,
            },
            theirs: `m/123'`,
          },
          privateKey:
            '0x0b2cb2b767417eb0c62c1d9de3d3d0e45c4136747cf18d70c29adefcc0556a6d',
          chainCode:
            '0xb036a60d0615c1f693c0fe1a6fc62ba2b089c964a809a10aa2c4c08d59bb06a2',
          depth: 1,
          index: 0x80000000 + 124,
        },
        {
          path: {
            ours: {
              tuple: [`bip32:123'`, `bip32:456'`],
              string: `bip32:123'/bip32:456'`,
            },
            theirs: `m/123'/456'`,
          },
          privateKey:
            '0x2915b5e7d9eecf028c96400e0490e4ae5e12b16426304810d69d8cccee529c89',
          chainCode:
            '0x0a1db8b483d43605120241c81259ea1f64b75c59a3fe5427186ac221cbe3f4d8',
          depth: 2,
          index: 0x80000000 + 456,
        },
      ],
    },

    // Note that this uses the `secp256k1` curve.
    slip10: {
      hexSeed:
        '0x747f302d9c916698912d5f70be53a6cf53bc495803a5523d3a7c3afa2afba94ec3803f838b3e1929ab5481f9da35441372283690fdcf27372c38f40ba134fe03',
      keys: [
        {
          path: {
            ours: {
              tuple: [`slip10:3`],
              string: `slip10:3`,
            },
            theirs: `m/3`,
          },
          privateKey:
            '0x7f861ec23cea91757c58ecd4a17dcb9396b3adfdf6a7a97395746fdb5c56854f',
          chainCode:
            '0xa801ebec457c8ea6c50dc55bea849384a40c92159ad1972f1a35cc92e145c827',
        },
        {
          path: {
            ours: {
              tuple: [`slip10:3`, `slip10:0`],
              string: `slip10:3/slip10:0`,
            },
            theirs: `m/3/0`,
          },
          privateKey:
            '0x1657de87ad376e58538e72fe30a7567ddc0a7eef08ee93a6cdcf7c83f4a62786',
          chainCode:
            '0x8235d18356fe4ad0f5bd99ef69c57613e871a66aeb3a9abfdd986188858f41f6',
        },
        {
          path: {
            ours: {
              tuple: [`slip10:123'`],
              string: `slip10:123'`,
            },
            theirs: `m/123'`,
          },
          privateKey:
            '0x3967b87fd18ac7cbba8f587ad558070d30b60ba0371e69deb779115001614717',
          chainCode:
            '0x7ea274d541b03eef655ba0dce49f80d3618c1206cdc99da662f32b1193225829',
        },
        {
          path: {
            ours: {
              tuple: [`slip10:123'`, `slip10:456'`],
              string: `slip10:123'/slip10:456'`,
            },
            theirs: `m/123'/456'`,
          },
          privateKey:
            '0xe533b68958c076ce6d42420d61695d83a0a1af24a9ae5564b7679f52d6dd6f5e',
          chainCode:
            '0xfbd82ae4ac9f4e8176034b54a7ed5a2b836879bb1f94b136890fc86fcf4cd4c5',
        },
      ],
    },
  },
} as const;
