import type {
  AssetMetadata,
  AssetsControllerStateInternal,
  Caip19AssetId,
} from '../../types.js';

/**
 * Example state for the scam-token cleanup integration test
 * (`AssetsController.spam-cleanup.integration.test.ts`).
 *
 * Captured from a production state log (`MetaMask_state_logs__2_.json`): a
 * heavily airdropped wallet holding 83 assets across EVM, Solana, Bitcoin,
 * Tron and Stellar, with the usual Base airdrop scam tokens sitting next to
 * genuine holdings. Only the slices the spam sweep reads are kept:
 * `assetsInfo` (what is tracked), `customAssets` (the hand-imported Arbitrum
 * USDC that must survive) and the native asset map. Balances are derived
 * per-account so swept scam tokens also leave balances.
 */

export const SCAM_WALLET_ACCOUNT_ID = 'spam-cleanup-account';
export const SCAM_WALLET_ACCOUNT_ADDRESS =
  '0x7950fb33c6ca289446feeefae14fc156741f93ac';

/** The hand-imported token, keyed by its real owning account id. */
export const SCAM_WALLET_CUSTOM_ASSETS = {
  '980769e0-a280-4ea1-b98a-71a35026bbb1': [
    'eip155:42161/erc20:0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const,
  ],
};

/** Metadata for all 83 assets, verbatim from the state log. */
export const SCAM_WALLET_ASSETS_INFO = {
  'bip122:000000000019d6689c085ae165831e93/slip44:0': {
    aggregators: ['metamask'],
    decimals: 8,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/bip122/000000000019d6689c085ae165831e93/slip44/0.png',
    name: 'Bitcoin',
    occurrences: 100,
    symbol: 'BTC',
    type: 'native',
  },
  'eip155:1/erc20:0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39': {
    decimals: 8,
    image:
      'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x2b591e99afe9f32eaa6214f7b7629768c40eeb39.png',
    name: 'HEX',
    symbol: 'HEX',
    type: 'erc20',
  },
  'eip155:1/erc20:0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8': {
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x4d5f47fa6a74757f35c14fd3a6ef8e3c9bc514e8.png',
    name: 'Aave v3 WETH',
    symbol: 'AWETH',
    type: 'erc20',
  },
  'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': {
    aggregators: [
      'metamask',
      'oneInch',
      'liFi',
      'trustWallet',
      'rubic',
      'squid',
      'rango',
      'sonarwatch',
      'sushiSwap',
      'bancor',
    ],
    decimals: 6,
    description: {
      en: 'USDC is a fully collateralized US dollar stablecoin. USDC is the bridge between dollars and trading on cryptocurrency exchanges. The technology behind CENTRE makes it possible to exchange value between people, businesses and financial institutions just like email between mail services and texts between SMS providers. We believe by removing artificial economic borders, we can create a more inclusive global economy.',
    },
    erc20Permit: true,
    fees: {
      avgFee: 0,
      maxFee: 0,
      minFee: 0,
    },
    honeypotStatus: {
      honeypotIs: false,
    },
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/1/erc20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.png',
    isContractVerified: true,
    labels: ['stable_coin', 'badges:v1:stablecoin'],
    name: 'USDC',
    occurrences: 10,
    storage: {
      approval: 10,
      balance: 9,
    },
    symbol: 'USDC',
    type: 'erc20',
  },
  'eip155:1/erc20:0xA700b4eB416Be35b2911fd5Dee80678ff64fF6C9': {
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v1/tokenIcons/1/0xa700b4eb416be35b2911fd5dee80678ff64ff6c9.png',
    name: 'Aave v3 AAVE',
    symbol: 'AAAVE',
    type: 'erc20',
  },
  'eip155:1/erc20:0xAa0200d169fF3ba9385c12E073c5d1d30434AE7b': {
    decimals: 6,
    image:
      'https://static.cx.metamask.io/api/v1/tokenIcons/1/0xaa0200d169ff3ba9385c12e073c5d1d30434ae7b.png',
    name: 'Aave v3 mUSD',
    symbol: 'AMUSD',
    type: 'erc20',
  },
  'eip155:1/erc20:0xacA92E438df0B2401fF60dA7E4337B687a2435DA': {
    decimals: 6,
    image:
      'https://static.cx.metamask.io/api/v1/tokenIcons/1/0xaca92e438df0b2401ff60da7e4337b687a2435da.png',
    name: 'MetaMask USD',
    symbol: 'MUSD',
    type: 'erc20',
  },
  'eip155:1/slip44:60': {
    type: 'native',
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/1/slip44/60.png',
    occurrences: 100,
    aggregators: [],
    erc20Permit: false,
    honeypotStatus: {},
    isContractVerified: false,
    description: {
      en: 'Ethereum is a global, open-source platform for decentralized applications. In other words, the vision is to create a world computer that anyone can build applications in a decentralized manner; while all states and data are distributed and publicly accessible. Ethereum supports smart contracts in which developers can write code in order to program digital value. Examples of decentralized apps (dapps) that are built on Ethereum includes tokens, non-fungible tokens, decentralized finance apps, lending protocol, decentralized exchanges, and much more.On Ethereum, all transactions and smart contract executions require a small fee to be paid. This fee is called Gas. In technical terms, Gas refers to the unit of measure on the amount of computational effort required to execute an operation or a smart contract. The more complex the execution operation is, the more gas is required to fulfill that operation. Gas fees are paid entirely in Ether (ETH), which is the native coin of the blockchain. The price of gas can fluctuate from time to time depending on the network demand.',
      ko: '이더리움(Ethereum/ETH)은 블록체인 기술에 기반한 클라우드 컴퓨팅 플랫폼 또는 프로그래밍 언어이다. 비탈릭 부테린이 개발하였다.비탈릭 부테린은 가상화폐인 비트코인에 사용된 핵심 기술인 블록체인(blockchain)에 화폐 거래 기록뿐 아니라 계약서 등의 추가 정보를 기록할 수 있다는 점에 착안하여, 전 세계 수많은 사용자들이 보유하고 있는 컴퓨팅 자원을 활용해 분산 네트워크를 구성하고, 이 플랫폼을 이용하여 SNS, 이메일, 전자투표 등 다양한 정보를 기록하는 시스템을 창안했다. 이더리움은 C++, 자바, 파이썬, GO 등 주요 프로그래밍 언어를 지원한다.이더리움을 사물 인터넷(IoT)에 적용하면 기계 간 금융 거래도 가능해진다. 예를 들어 고장난 청소로봇이 정비로봇에 돈을 내고 정비를 받고, 청소로봇은 돈을 벌기 위해 정비로봇의 집을 청소하는 것도 가능해진다.',
      zh: 'Ethereum（以太坊）是一个平台和一种编程语言，使开发人员能够建立和发布下一代分布式应用。Ethereum 是使用甲醚作为燃料，以激励其网络的第一个图灵完备cryptocurrency。Ethereum（以太坊） 是由Vitalik Buterin的创建。该项目于2014年8月获得了美国1800万$比特币的价值及其crowdsale期间。在2016年，Ethereum（以太坊）的价格上涨超过50倍。',
      ja: 'イーサリアム (Ethereum, ETH)・プロジェクトにより開発が進められている、分散型アプリケーション（DApps）やスマート・コントラクトを構築するためのプラットフォームの名称、及び関連するオープンソース・ソフトウェア・プロジェクトの総称である。イーサリアムでは、イーサリアム・ネットワークと呼ばれるP2Pのネットワーク上でスマート・コントラクトの履行履歴をブロックチェーンに記録していく。またイーサリアムは、スマート・コントラクトを記述するチューリング完全なプログラミング言語を持ち、ネットワーク参加者はこのネットワーク上のブロックチェーンに任意のDAppsやスマート・コントラクトを記述しそれを実行することが可能になる。ネットワーク参加者が「Ether」と呼ばれるイーサリアム内部通貨の報酬を目当てに、採掘と呼ばれるブロックチェーンへのスマート・コントラクトの履行結果の記録を行うことで、その正統性を保証していく。このような仕組みにより特定の中央管理組織に依拠せず、P2P全体を実行環境としてプログラムの実行とその結果を共有することが可能になった。',
    },
  },
  'eip155:10/slip44:60': {
    type: 'native',
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/10/slip44/60.png',
    occurrences: 100,
    aggregators: [],
    erc20Permit: false,
    honeypotStatus: {},
    isContractVerified: false,
    description: {
      en: 'Ethereum is a global, open-source platform for decentralized applications. In other words, the vision is to create a world computer that anyone can build applications in a decentralized manner; while all states and data are distributed and publicly accessible. Ethereum supports smart contracts in which developers can write code in order to program digital value. Examples of decentralized apps (dapps) that are built on Ethereum includes tokens, non-fungible tokens, decentralized finance apps, lending protocol, decentralized exchanges, and much more.On Ethereum, all transactions and smart contract executions require a small fee to be paid. This fee is called Gas. In technical terms, Gas refers to the unit of measure on the amount of computational effort required to execute an operation or a smart contract. The more complex the execution operation is, the more gas is required to fulfill that operation. Gas fees are paid entirely in Ether (ETH), which is the native coin of the blockchain. The price of gas can fluctuate from time to time depending on the network demand.',
      ko: '이더리움(Ethereum/ETH)은 블록체인 기술에 기반한 클라우드 컴퓨팅 플랫폼 또는 프로그래밍 언어이다. 비탈릭 부테린이 개발하였다.비탈릭 부테린은 가상화폐인 비트코인에 사용된 핵심 기술인 블록체인(blockchain)에 화폐 거래 기록뿐 아니라 계약서 등의 추가 정보를 기록할 수 있다는 점에 착안하여, 전 세계 수많은 사용자들이 보유하고 있는 컴퓨팅 자원을 활용해 분산 네트워크를 구성하고, 이 플랫폼을 이용하여 SNS, 이메일, 전자투표 등 다양한 정보를 기록하는 시스템을 창안했다. 이더리움은 C++, 자바, 파이썬, GO 등 주요 프로그래밍 언어를 지원한다.이더리움을 사물 인터넷(IoT)에 적용하면 기계 간 금융 거래도 가능해진다. 예를 들어 고장난 청소로봇이 정비로봇에 돈을 내고 정비를 받고, 청소로봇은 돈을 벌기 위해 정비로봇의 집을 청소하는 것도 가능해진다.',
      zh: 'Ethereum（以太坊）是一个平台和一种编程语言，使开发人员能够建立和发布下一代分布式应用。Ethereum 是使用甲醚作为燃料，以激励其网络的第一个图灵完备cryptocurrency。Ethereum（以太坊） 是由Vitalik Buterin的创建。该项目于2014年8月获得了美国1800万$比特币的价值及其crowdsale期间。在2016年，Ethereum（以太坊）的价格上涨超过50倍。',
      ja: 'イーサリアム (Ethereum, ETH)・プロジェクトにより開発が進められている、分散型アプリケーション（DApps）やスマート・コントラクトを構築するためのプラットフォームの名称、及び関連するオープンソース・ソフトウェア・プロジェクトの総称である。イーサリアムでは、イーサリアム・ネットワークと呼ばれるP2Pのネットワーク上でスマート・コントラクトの履行履歴をブロックチェーンに記録していく。またイーサリアムは、スマート・コントラクトを記述するチューリング完全なプログラミング言語を持ち、ネットワーク参加者はこのネットワーク上のブロックチェーンに任意のDAppsやスマート・コントラクトを記述しそれを実行することが可能になる。ネットワーク参加者が「Ether」と呼ばれるイーサリアム内部通貨の報酬を目当てに、採掘と呼ばれるブロックチェーンへのスマート・コントラクトの履行結果の記録を行うことで、その正統性を保証していく。このような仕組みにより特定の中央管理組織に依拠せず、P2P全体を実行環境としてプログラムの実行とその結果を共有することが可能になった。',
    },
  },
  'eip155:137/slip44:966': {
    type: 'native',
    name: 'Polygon Ecosystem Token',
    symbol: 'POL',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/137/slip44/966.png',
    occurrences: 100,
    aggregators: [],
    erc20Permit: false,
    honeypotStatus: {},
  },
  'eip155:143/erc20:0xacA92E438df0B2401fF60dA7E4337B687a2435DA': {
    decimals: 6,
    name: 'MetaMask USD',
    symbol: 'mUSD',
    type: 'erc20',
  },
  'eip155:143/slip44:268435779': {
    type: 'native',
    name: 'Mon',
    symbol: 'MON',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/143/slip44/268435779.png',
    occurrences: 100,
    aggregators: [],
  },
  'eip155:42161/erc20:0xaf88d065e77c8cC2239327C5EDb3A432268e5831': {
    aggregators: [
      'traderJoe',
      'oneInch',
      'liFi',
      'rubic',
      'squid',
      'rango',
      'sonarwatch',
      'sushiSwap',
    ],
    decimals: 6,
    description: {
      en: 'USDC is a fully collateralized US dollar stablecoin. USDC is the bridge between dollars and trading on cryptocurrency exchanges. The technology behind CENTRE makes it possible to exchange value between people, businesses and financial institutions just like email between mail services and texts between SMS providers. We believe by removing artificial economic borders, we can create a more inclusive global economy.',
    },
    erc20Permit: true,
    honeypotStatus: {},
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/42161/erc20/0xaf88d065e77c8cc2239327c5edb3a432268e5831.png',
    isContractVerified: true,
    labels: ['badges:v1:stablecoin'],
    name: 'USD Coin (Native)',
    occurrences: 8,
    storage: {
      approval: 10,
      balance: 9,
    },
    symbol: 'USDC',
    type: 'erc20',
  },
  'eip155:42161/slip44:60': {
    type: 'native',
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/42161/slip44/60.png',
    occurrences: 100,
    aggregators: [],
    erc20Permit: false,
    honeypotStatus: {},
    isContractVerified: false,
    description: {
      en: 'Ethereum is a global, open-source platform for decentralized applications. In other words, the vision is to create a world computer that anyone can build applications in a decentralized manner; while all states and data are distributed and publicly accessible. Ethereum supports smart contracts in which developers can write code in order to program digital value. Examples of decentralized apps (dapps) that are built on Ethereum includes tokens, non-fungible tokens, decentralized finance apps, lending protocol, decentralized exchanges, and much more.On Ethereum, all transactions and smart contract executions require a small fee to be paid. This fee is called Gas. In technical terms, Gas refers to the unit of measure on the amount of computational effort required to execute an operation or a smart contract. The more complex the execution operation is, the more gas is required to fulfill that operation. Gas fees are paid entirely in Ether (ETH), which is the native coin of the blockchain. The price of gas can fluctuate from time to time depending on the network demand.',
      ko: '이더리움(Ethereum/ETH)은 블록체인 기술에 기반한 클라우드 컴퓨팅 플랫폼 또는 프로그래밍 언어이다. 비탈릭 부테린이 개발하였다.비탈릭 부테린은 가상화폐인 비트코인에 사용된 핵심 기술인 블록체인(blockchain)에 화폐 거래 기록뿐 아니라 계약서 등의 추가 정보를 기록할 수 있다는 점에 착안하여, 전 세계 수많은 사용자들이 보유하고 있는 컴퓨팅 자원을 활용해 분산 네트워크를 구성하고, 이 플랫폼을 이용하여 SNS, 이메일, 전자투표 등 다양한 정보를 기록하는 시스템을 창안했다. 이더리움은 C++, 자바, 파이썬, GO 등 주요 프로그래밍 언어를 지원한다.이더리움을 사물 인터넷(IoT)에 적용하면 기계 간 금융 거래도 가능해진다. 예를 들어 고장난 청소로봇이 정비로봇에 돈을 내고 정비를 받고, 청소로봇은 돈을 벌기 위해 정비로봇의 집을 청소하는 것도 가능해진다.',
      zh: 'Ethereum（以太坊）是一个平台和一种编程语言，使开发人员能够建立和发布下一代分布式应用。Ethereum 是使用甲醚作为燃料，以激励其网络的第一个图灵完备cryptocurrency。Ethereum（以太坊） 是由Vitalik Buterin的创建。该项目于2014年8月获得了美国1800万$比特币的价值及其crowdsale期间。在2016年，Ethereum（以太坊）的价格上涨超过50倍。',
      ja: 'イーサリアム (Ethereum, ETH)・プロジェクトにより開発が進められている、分散型アプリケーション（DApps）やスマート・コントラクトを構築するためのプラットフォームの名称、及び関連するオープンソース・ソフトウェア・プロジェクトの総称である。イーサリアムでは、イーサリアム・ネットワークと呼ばれるP2Pのネットワーク上でスマート・コントラクトの履行履歴をブロックチェーンに記録していく。またイーサリアムは、スマート・コントラクトを記述するチューリング完全なプログラミング言語を持ち、ネットワーク参加者はこのネットワーク上のブロックチェーンに任意のDAppsやスマート・コントラクトを記述しそれを実行することが可能になる。ネットワーク参加者が「Ether」と呼ばれるイーサリアム内部通貨の報酬を目当てに、採掘と呼ばれるブロックチェーンへのスマート・コントラクトの履行結果の記録を行うことで、その正統性を保証していく。このような仕組みにより特定の中央管理組織に依拠せず、P2P全体を実行環境としてプログラムの実行とその結果を共有することが可能になった。',
    },
  },
  'eip155:4663/slip44:60': {
    type: 'native',
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/4663/slip44/60.png',
    occurrences: 1,
    aggregators: [],
  },
  'eip155:5042/slip44:5042': {
    decimals: 18,
    name: 'USDC',
    symbol: 'USDC',
    type: 'native',
  },
  'eip155:534352/slip44:60': {
    aggregators: [],
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/534352/slip44/60.png',
    name: 'Ether',
    occurrences: 100,
    symbol: 'ETH',
    type: 'native',
  },
  'eip155:56/erc20:0x5CA42204cDaa70d5c773946e69dE942b85CA6706': {
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v1/tokenIcons/56/0x5ca42204cdaa70d5c773946e69de942b85ca6706.png',
    name: 'Position',
    symbol: 'POSI',
    type: 'erc20',
  },
  'eip155:56/erc20:0x683e9dCf085E5efCc7925858aAcE94D4b8882024': {
    decimals: 9,
    image:
      'https://static.cx.metamask.io/api/v1/tokenIcons/56/0x683e9dcf085e5efcc7925858aace94d4b8882024.png',
    name: 'TangYuan',
    symbol: 'TANGYUAN',
    type: 'erc20',
  },
  'eip155:56/slip44:714': {
    type: 'native',
    name: 'Binance Coin',
    symbol: 'BNB',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/56/slip44/714.png',
    occurrences: 100,
    aggregators: [],
    erc20Permit: false,
    honeypotStatus: {},
    isContractVerified: false,
    description: {
      en: 'Binance Coin is the cryptocurrency of the <a href="https://www.coingecko.com/en/exchanges/binance">Binance</a> platform. It is a trading platform exclusively for cryptocurrencies. The name "Binance" is a combination of binary and finance.Thus, the startup name shows that only cryptocurrencies can be traded against each other. It is not possible to trade crypto currencies against Fiat. The platform achieved an enormous success within a very short time and is focused on worldwide market with Malta headquarters. The cryptocurrency currently has a daily trading volume of 1.5 billion - 2 billion US dollars and is still increasing.In total, there will only be 200 million BNBs. Binance uses the <a href="https://www.coingecko.com/en/coins/all?asset_platform_id=279">ERC20 token standard</a> from <a href="https://www.coingecko.com/en/coins/ethereum">Ethereum</a> and has distributed it as follow: 50% sold on ICO, 40% to the team and 10% to Angel investors. The coin can be used to pay fees on Binance. These include trading fees, transaction fees, listing fees and others. Binance gives you a huge discount when fees are paid in BNB. The schedule of BNB fees discount is as follow: In the first year, 50% discount on all fees, second year 25% discount, third year 12.5% discount, fourth year 6.75 % discount, and from the fifth year onwards there is no discount. This structure is used to incentivize users to buy BNB and do trades within Binance.Binance announced in a buyback plan that it would buy back up to 100 million BNB in Q1 2018. The coins are then burned. This means that they are devaluated to increase the value of the remaining coins. This benefits investors. In the future, the cryptocurrency will remain an asset on the trading platform and will be used as gas.Other tokens that are issued by exchanges include <a href="https://www.coingecko.com/en/coins/bibox-token">Bibox Token</a>, <a href="https://www.coingecko.com/en/coins/okb">OKB</a>, <a href="https://www.coingecko.com/en/coins/huobi-token">Huobi Token</a>, and more.',
    },
  },
  'eip155:59144/erc20:0xacA92E438df0B2401fF60dA7E4337B687a2435DA': {
    type: 'erc20',
    name: 'MetaMask USD',
    symbol: 'MUSD',
    decimals: 6,
    occurrences: 6,
    aggregators: ['metamask', 'oneInch', 'liFi', 'rubic', 'squid', 'rango'],
    labels: ['badges:v1:stablecoin'],
    storage: {
      approvalStr:
        '92155457228465093955173560380360064720849401111993098342695494701049963192576',
      balanceStr:
        '107734271257630865975065146523144289492045861028913371777218889022146465165570',
    },
    isContractVerified: true,
  },
  'eip155:59144/slip44:60': {
    type: 'native',
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/59144/slip44/60.png',
    occurrences: 1,
    aggregators: [],
    erc20Permit: false,
    honeypotStatus: {},
    description: {
      en: 'Ethereum is a global, open-source platform for decentralized applications. In other words, the vision is to create a world computer that anyone can build applications in a decentralized manner; while all states and data are distributed and publicly accessible. Ethereum supports smart contracts in which developers can write code in order to program digital value. Examples of decentralized apps (dapps) that are built on Ethereum includes tokens, non-fungible tokens, decentralized finance apps, lending protocol, decentralized exchanges, and much more.On Ethereum, all transactions and smart contract executions require a small fee to be paid. This fee is called Gas. In technical terms, Gas refers to the unit of measure on the amount of computational effort required to execute an operation or a smart contract. The more complex the execution operation is, the more gas is required to fulfill that operation. Gas fees are paid entirely in Ether (ETH), which is the native coin of the blockchain. The price of gas can fluctuate from time to time depending on the network demand.',
      ko: '이더리움(Ethereum/ETH)은 블록체인 기술에 기반한 클라우드 컴퓨팅 플랫폼 또는 프로그래밍 언어이다. 비탈릭 부테린이 개발하였다.비탈릭 부테린은 가상화폐인 비트코인에 사용된 핵심 기술인 블록체인(blockchain)에 화폐 거래 기록뿐 아니라 계약서 등의 추가 정보를 기록할 수 있다는 점에 착안하여, 전 세계 수많은 사용자들이 보유하고 있는 컴퓨팅 자원을 활용해 분산 네트워크를 구성하고, 이 플랫폼을 이용하여 SNS, 이메일, 전자투표 등 다양한 정보를 기록하는 시스템을 창안했다. 이더리움은 C++, 자바, 파이썬, GO 등 주요 프로그래밍 언어를 지원한다.이더리움을 사물 인터넷(IoT)에 적용하면 기계 간 금융 거래도 가능해진다. 예를 들어 고장난 청소로봇이 정비로봇에 돈을 내고 정비를 받고, 청소로봇은 돈을 벌기 위해 정비로봇의 집을 청소하는 것도 가능해진다.',
      zh: 'Ethereum（以太坊）是一个平台和一种编程语言，使开发人员能够建立和发布下一代分布式应用。Ethereum 是使用甲醚作为燃料，以激励其网络的第一个图灵完备cryptocurrency。Ethereum（以太坊） 是由Vitalik Buterin的创建。该项目于2014年8月获得了美国1800万$比特币的价值及其crowdsale期间。在2016年，Ethereum（以太坊）的价格上涨超过50倍。',
      ja: 'イーサリアム (Ethereum, ETH)・プロジェクトにより開発が進められている、分散型アプリケーション（DApps）やスマート・コントラクトを構築するためのプラットフォームの名称、及び関連するオープンソース・ソフトウェア・プロジェクトの総称である。イーサリアムでは、イーサリアム・ネットワークと呼ばれるP2Pのネットワーク上でスマート・コントラクトの履行履歴をブロックチェーンに記録していく。またイーサリアムは、スマート・コントラクトを記述するチューリング完全なプログラミング言語を持ち、ネットワーク参加者はこのネットワーク上のブロックチェーンに任意のDAppsやスマート・コントラクトを記述しそれを実行することが可能になる。ネットワーク参加者が「Ether」と呼ばれるイーサリアム内部通貨の報酬を目当てに、採掘と呼ばれるブロックチェーンへのスマート・コントラクトの履行結果の記録を行うことで、その正統性を保証していく。このような仕組みにより特定の中央管理組織に依拠せず、P2P全体を実行環境としてプログラムの実行とその結果を共有することが可能になった。',
    },
  },
  'eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913': {
    decimals: 6,
    image:
      'https://static.cx.metamask.io/api/v1/tokenIcons/8453/0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.png',
    name: 'USD Coin',
    symbol: 'USDC',
    type: 'erc20',
  },
  'eip155:8453/slip44:60': {
    type: 'native',
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/8453/slip44/60.png',
    occurrences: 100,
    aggregators: [],
    erc20Permit: false,
    honeypotStatus: {},
  },
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
    aggregators: [],
    decimals: 9,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/solana/5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44/501.png',
    name: 'SOL',
    occurrences: 100,
    symbol: 'SOL',
    type: 'native',
  },
  'stellar:pubnet/slip44:148': {
    aggregators: [],
    decimals: 7,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/stellar/pubnet/slip44/148.png',
    name: 'XLM',
    occurrences: 100,
    symbol: 'XLM',
    type: 'native',
  },
  'tron:728126428/slip44:195': {
    aggregators: [],
    decimals: 6,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/tron/728126428/slip44/195.png',
    name: 'TRON',
    occurrences: 100,
    symbol: 'TRX',
    type: 'native',
  },
  'eip155:4663/erc20:0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168': {
    type: 'erc20',
    name: 'Global Dollar',
    symbol: 'USDG',
    decimals: 6,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/4663/erc20/0x5fc5360d0400a0fd4f2af552add042d716f1d168.png',
    occurrences: 3,
    aggregators: ['metamask', 'oneInch', 'liFi'],
    storage: {
      approval: 3,
      balance: 1,
    },
  },
  'eip155:1/erc20:0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c': {
    type: 'erc20',
    name: 'Aave v3 USDC',
    symbol: 'AUSDC',
    decimals: 6,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/1/erc20/0x98c23e9d8f34fefb1b7bd6a91b7ff122f4e16f5c.png',
    occurrences: 6,
    aggregators: [
      'metamask',
      'oneInch',
      'liFi',
      'rubic',
      'rango',
      'sonarwatch',
    ],
    erc20Permit: true,
    fees: {
      avgFee: 0,
      maxFee: 0,
      minFee: 0,
    },
    honeypotStatus: {
      honeypotIs: false,
    },
    storage: {
      balance: 52,
      approval: 53,
    },
    isContractVerified: true,
    description: {
      en: 'USD Coin in AAVE V3 Ethereum Market',
    },
  },
  'eip155:1/erc20:0x3b484b82567a09e2588A13D54D032153f0c0aEe0': {
    type: 'erc20',
    name: 'OpenDAO',
    symbol: 'SOS',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/1/erc20/0x3b484b82567a09e2588a13d54d032153f0c0aee0.png',
    occurrences: 8,
    aggregators: [
      'coinMarketCap',
      'oneInch',
      'trustWallet',
      'rubic',
      'squid',
      'rango',
      'sonarwatch',
      'sushiSwap',
    ],
    erc20Permit: false,
    fees: {
      avgFee: 0,
      maxFee: 0,
      minFee: 0,
    },
    honeypotStatus: {
      honeypotIs: false,
      goPlus: false,
    },
    storage: {
      balance: 0,
      approval: 1,
    },
    isContractVerified: true,
    description: {
      en: 'OpenDAO ($SOS) is a token for the NFT ecosystem. An airdrop is conducted for all users who have traded on OpenSea. Treasury holdings will be used to protect traders on OpenSea, support NFT artists/communities, and developer grant.',
    },
  },
  'eip155:1/erc20:0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84': {
    type: 'erc20',
    name: 'Liquid staked Ether 2.0',
    symbol: 'STETH',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/1/erc20/0xae7ab96520de3a18e5e111b5eaab095312d7fe84.png',
    occurrences: 7,
    aggregators: [
      'metamask',
      'oneInch',
      'liFi',
      'rubic',
      'squid',
      'rango',
      'sonarwatch',
    ],
    erc20Permit: true,
    fees: {
      avgFee: 12.654644390656694,
      maxFee: 12.654644390656703,
      minFee: 12.654644390656703,
    },
    honeypotStatus: {
      honeypotIs: false,
    },
    storage: {
      balance: 0,
      approval: 1,
    },
    isContractVerified: true,
    description: {
      en: 'Lido Staked Ether (stETH) is a token that represents your staked ether in Lido, combining the value of initial deposit and staking rewards. stETH tokens are minted upon deposit and burned when redeemed. stETH token balances are pegged 1:1 to the ethers that are staked by Lido and the token’s balances are updated daily to reflect earnings and rewards. stETH tokens can be used as one would use ether, allowing you to earn ETH 2.0 staking rewards whilst benefiting from e.g. yields across decentralised finance products.',
    },
  },
  'eip155:1/erc20:0xc5102fE9359FD9a28f877a67E36B0F050d81a3CC': {
    type: 'erc20',
    name: 'Hop',
    symbol: 'HOP',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/1/erc20/0xc5102fe9359fd9a28f877a67e36b0f050d81a3cc.png',
    occurrences: 7,
    aggregators: [
      'coinMarketCap',
      'liFi',
      'rubic',
      'squid',
      'rango',
      'sonarwatch',
      'sushiSwap',
    ],
    erc20Permit: true,
    fees: {
      avgFee: 0,
      maxFee: 0,
      minFee: 0,
    },
    honeypotStatus: {
      honeypotIs: false,
      goPlus: false,
    },
    storage: {
      balance: 0,
      approval: 1,
    },
    isContractVerified: true,
    description: {
      en: 'Hop is a protocol for sending tokens across rollups and their shared layer-1 network in a quick and trustless manner.',
    },
  },
  'eip155:1/erc20:0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72': {
    type: 'erc20',
    name: 'Ethereum Name Service',
    symbol: 'ENS',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/1/erc20/0xc18360217d8f7ab5e7c516566761ea12ce7f9d72.png',
    occurrences: 10,
    aggregators: [
      'metamask',
      'oneInch',
      'liFi',
      'trustWallet',
      'rubic',
      'squid',
      'rango',
      'sonarwatch',
      'sushiSwap',
      'bancor',
    ],
    erc20Permit: true,
    fees: {
      avgFee: 0,
      maxFee: 0,
      minFee: 0,
    },
    honeypotStatus: {
      honeypotIs: false,
      goPlus: false,
    },
    storage: {
      balance: 0,
      approval: 1,
    },
    isContractVerified: true,
    description: {
      en: "The Ethereum Name Service (ENS) is a distributed, open, and extensible naming system based on the Ethereum blockchain.ENS’s job is to map human-readable names like ‘alice.eth’ to machine-readable identifiers such as Ethereum addresses, other cryptocurrency addresses, content hashes, and metadata. ENS also supports ‘reverse resolution’, making it possible to associate metadata such as canonical names or interface descriptions with Ethereum addresses.ENS has similar goals to DNS, the Internet’s Domain Name Service, but has significantly different architecture due to the capabilities and constraints provided by the Ethereum blockchain. Like DNS, ENS operates on a system of dot-separated hierarchical names called domains, with the owner of a domain having full control over subdomains.Top-level domains, like ‘.eth’ and ‘.test’, are owned by smart contracts called registrars, which specify rules governing the allocation of their subdomains. Anyone may, by following the rules imposed by these registrar contracts, obtain ownership of a domain for their own use. ENS also supports importing in DNS names already owned by the user for use on ENS.Because of the hierarchal nature of ENS, anyone who owns a domain at any level may configure subdomains - for themselves or others - as desired. For instance, if Alice owns 'alice.eth', she can create 'pay.alice.eth' and configure it as she wishes.ENS is deployed on the Ethereum main network and on several test networks. If you use a library such as the ensjs Javascript library, or an end-user application, it will automatically detect the network you are interacting with and use the ENS deployment on that network.",
    },
  },
  'eip155:8453/erc20:0xE3086852A4B125803C815a158249ae468A3254Ca': {
    type: 'erc20',
    name: 'mfercoin',
    symbol: 'MFER',
    decimals: 18,
    occurrences: 6,
    aggregators: ['coinGecko', 'liFi', 'rubic', 'squid', 'rango', 'sonarwatch'],
    erc20Permit: false,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      approval: 1,
      balance: 0,
    },
    isContractVerified: true,
  },
  'eip155:8453/erc20:0xcdE172dc5ffC46D228838446c57C1227e0B82049': {
    type: 'erc20',
    name: 'Boomer',
    symbol: 'BOOMER',
    decimals: 18,
    occurrences: 4,
    aggregators: ['coinGecko', 'rubic', 'rango', 'sonarwatch'],
    erc20Permit: false,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      approval: 1,
      balance: 0,
    },
    isContractVerified: true,
  },
  'eip155:8453/erc20:0xba71Cb8Ef2d59dE7399745793657838829E0B147': {
    type: 'erc20',
    name: 'Siamese',
    symbol: 'SIAM',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/8453/erc20/0xba71cb8ef2d59de7399745793657838829e0b147.png',
    occurrences: 4,
    aggregators: ['coinGecko', 'rubic', 'rango', 'sonarwatch'],
    erc20Permit: false,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      approval: 1,
      balance: 0,
    },
    isContractVerified: true,
    description: {
      en: 'One of the first community owned Meme tokens on the base chain! ',
    },
  },
  'eip155:8453/erc20:0xb56d0839998Fd79EFCD15c27cF966250AA58D6D3': {
    type: 'erc20',
    name: 'Based USA',
    symbol: 'USA',
    decimals: 18,
    occurrences: 4,
    aggregators: ['coinGecko', 'rubic', 'rango', 'sonarwatch'],
    erc20Permit: false,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      approval: 2,
      balance: 1,
    },
    isContractVerified: true,
  },
  'eip155:8453/erc20:0xA0aeBd4Ae5F256B72B7D43f67eD934237Adb1AeE': {
    type: 'erc20',
    name: 'BONSAI COIN',
    symbol: 'BONSAICOIN',
    decimals: 18,
    occurrences: 3,
    aggregators: ['coinGecko', 'rubic', 'rango'],
    erc20Permit: false,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      approval: 6,
      balance: 5,
    },
    isContractVerified: true,
  },
  'eip155:8453/erc20:0x6223901eA64608c75Da8497d5eff15D19A1D8fd5': {
    type: 'erc20',
    name: 'Corgi',
    symbol: 'CORGI',
    decimals: 18,
    occurrences: 4,
    aggregators: ['coinGecko', 'rubic', 'rango', 'sonarwatch'],
    erc20Permit: true,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      approval: 1,
      balance: 0,
    },
    isContractVerified: true,
  },
  'eip155:8453/erc20:0x2C001233eD5E731B98B15B30267F78C7560b71f2': {
    type: 'erc20',
    name: 'BUBU',
    symbol: 'BUBU',
    decimals: 18,
    occurrences: 4,
    aggregators: ['coinGecko', 'rubic', 'rango', 'sonarwatch'],
    storage: {
      approval: 1,
      balance: 0,
    },
    isContractVerified: true,
  },
  'eip155:8453/erc20:0x4d58608EFf50b691A3B76189aF2a7A123dF1e9ba': {
    type: 'erc20',
    name: 'Boysclubbase',
    symbol: '$BOYS',
    decimals: 9,
    occurrences: 4,
    aggregators: ['coinGecko', 'rubic', 'rango', 'sonarwatch'],
    erc20Permit: false,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      approval: 2,
      balance: 1,
    },
    isContractVerified: true,
  },
  'eip155:8453/erc20:0x9aAaE745cf2830FB8DDc6248B17436dC3a5E701C': {
    type: 'erc20',
    name: 'Gochujangcoin',
    symbol: 'GOCHU',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/8453/erc20/0x9aaae745cf2830fb8ddc6248b17436dc3a5e701c.png',
    occurrences: 4,
    aggregators: ['coinGecko', 'rubic', 'rango', 'sonarwatch'],
    erc20Permit: false,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      approval: 1,
      balance: 0,
    },
    isContractVerified: true,
    description: {
      en: "Gochujangcoin draws its inspiration from the renowned Korean condiment, Gochujang, and plans to expand its reach through related games, NFTs, and K-food recipes. The innovative 'Tap to Earn' games offer users new culinary experiences and encourage active participation, positioning Gochujangcoin as more substantive than typical investment tokens. It fosters an active community through K-food recipes, rewarding engagement with tokens and offering unique K-food-themed NFTs, blending culinary heritage with blockchain technology.",
    },
  },
  'eip155:8453/erc20:0x1b6A569DD61EdCe3C383f6D565e2f79Ec3a12980': {
    type: 'erc20',
    name: 'Young Peezy AKA Pepe',
    symbol: 'PEEZY',
    decimals: 18,
    occurrences: 4,
    aggregators: ['metamask', 'rubic', 'rango', 'sonarwatch'],
    erc20Permit: false,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      approval: 1,
      balance: 0,
    },
    isContractVerified: true,
  },
  'eip155:8453/erc20:0x174e33Ef2efFa0a4893d97DDa5db4044cC7993a3': {
    type: 'erc20',
    name: 'Keren',
    symbol: 'KEREN',
    decimals: 18,
    occurrences: 3,
    aggregators: ['rubic', 'rango', 'sonarwatch'],
    erc20Permit: false,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      approval: 2,
      balance: 1,
    },
    isContractVerified: true,
  },
  'eip155:8453/erc20:0x623cD3a3EdF080057892aaF8D773Bbb7A5C9b6e9': {
    type: 'erc20',
    name: 'Sekuya Multiverse',
    symbol: 'SKYA',
    decimals: 18,
    occurrences: 5,
    aggregators: ['coinGecko', 'liFi', 'rubic', 'rango', 'sonarwatch'],
    erc20Permit: false,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      approval: 2,
      balance: 1,
    },
    isContractVerified: true,
    description: {
      en: 'Sekuya is a video game company headquartered in Singapore. Born from a community, Sekuya aims to revolutionize the gaming landscape with a community-driven approach in all new anime epic fantasy universe. Sekuya’s flagship project, Sekuya Multiverse, an award-winning start-up project, combines 2 of the world’s most popular gaming genres: MOBA + RPG, promising a new gaming experience for global players of both genres. Problem: The current fast-growing MOBA gaming genres have not received a significant gameplay update since around 2003. Additionally, despite the total gaming revenue reaching $180 billion in 2023, game item ownership remains centralized. Approach: An entirely new genre of Epic Fantasy MOBA MMORPG powered by a unique Web3 ownership (heroes, items, skills, pets) and AI co-creation tools (user generated skin & personalized superpower). Positioning: We are among the pioneers in introducing a completely unique gameplay experience, along with Web3 ownership and AI co-creation tools that have the potential to appeal to millions of gamers and creators. Sekuya Multiverse, an award-winning start up project with GAMEFI AI RWA narrative, combines 2 of the world’s most favorite gaming genres: MOBA MMORPG, promising a new experience for 250 million global players Supported by over 100 communities in Southeast Asia, Sekuya Multiverse offers an immersive MMORPG experience set in the Novae Terrae, a 10-world universe. Players, known as "Jumpers," can utilize an AI character creator to customize their own character, interact with AI NPCs, embark on engaging storylines, and participate in battles to collect 400+ sekumon souls and win the grand rewards. Anticipate an exhilarating 5v5 MOBA featuring unique superpowers bestowed by Sekuya heroes and special abilities tailored to each player\'s personality.',
    },
  },
  'eip155:8453/erc20:0xE4fCf2D991505089bBb36275570757c1f9800cB0': {
    type: 'erc20',
    name: 'Purrcoin',
    symbol: 'PURR',
    decimals: 18,
    occurrences: 4,
    aggregators: ['coinGecko', 'rubic', 'rango', 'sonarwatch'],
    erc20Permit: true,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {},
    isContractVerified: true,
  },
  'eip155:8453/erc20:0xF8a99F2bF2ce5bb6cE4aafcf070D8723bc904Aa2': {
    type: 'erc20',
    name: 'Chinese Brett',
    symbol: 'CHRETT',
    decimals: 18,
    occurrences: 4,
    aggregators: ['coinGecko', 'rubic', 'rango', 'sonarwatch'],
    erc20Permit: false,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      approval: 9,
      balance: 8,
    },
    isContractVerified: true,
  },
  'eip155:8453/erc20:0x653A143B8d15C565C6623D1F168cFbeC1056D872': {
    type: 'erc20',
    name: 'kurbi',
    symbol: 'KURBI',
    decimals: 9,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/8453/erc20/0x653a143b8d15c565c6623d1f168cfbec1056d872.png',
    occurrences: 4,
    aggregators: ['coinGecko', 'rubic', 'rango', 'sonarwatch'],
    erc20Permit: false,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      approval: 2,
      balance: 1,
    },
    isContractVerified: true,
  },
  'eip155:8453/erc20:0x9DE16c805A3227b9b92e39a446F9d56cf59fe640': {
    type: 'erc20',
    name: 'Bento',
    symbol: 'BENTO',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/8453/erc20/0x9de16c805a3227b9b92e39a446f9d56cf59fe640.png',
    occurrences: 4,
    aggregators: ['coinGecko', 'rubic', 'rango', 'sonarwatch'],
    erc20Permit: false,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      approval: 1,
      balance: 0,
    },
    isContractVerified: true,
    description: {
      en: 'A Dog Meme Coin On Base',
    },
  },
  'eip155:8453/erc20:0x07d15798a67253D76cea61F0eA6F57AeDC59DffB': {
    type: 'erc20',
    name: 'Based Coin',
    symbol: 'BASED',
    decimals: 18,
    occurrences: 3,
    aggregators: ['coinGecko', 'rubic', 'rango'],
    erc20Permit: true,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      approval: 1,
      balance: 0,
    },
    isContractVerified: true,
  },
  'eip155:8453/erc20:0x40E3eDDF6d253BB734381A309437428f121c594b': {
    type: 'erc20',
    name: 'Larva Lads',
    symbol: 'LAD',
    decimals: 18,
    occurrences: 3,
    aggregators: ['rubic', 'rango', 'sonarwatch'],
    erc20Permit: true,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      approval: 1,
      balance: 0,
    },
    isContractVerified: true,
  },
  'eip155:8453/erc20:0xb8D98a102b0079B69FFbc760C8d857A31653e56e': {
    type: 'erc20',
    name: 'toby',
    symbol: 'TOBY',
    decimals: 18,
    occurrences: 7,
    aggregators: [
      'coinGecko',
      'oneInch',
      'rubic',
      'squid',
      'rango',
      'sonarwatch',
      'sushiSwap',
    ],
    erc20Permit: false,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      approval: 1,
      balance: 0,
    },
    isContractVerified: true,
    description: {
      en: 'cute frog community project airdropped to entire base community',
    },
  },
  'eip155:137/erc20:0xEDcFb6984a3c70501BAA8b7f5421Ae795ecC1496': {
    type: 'erc20',
    name: 'ABCMETA Token',
    symbol: 'META',
    decimals: 8,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/137/erc20/0xedcfb6984a3c70501baa8b7f5421ae795ecc1496.png',
    occurrences: 3,
    aggregators: ['sonarwatch', 'rubic', 'rango'],
    erc20Permit: false,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      approval: 1,
      balance: 0,
    },
    isContractVerified: true,
  },
  'eip155:10/erc20:0x4200000000000000000000000000000000000042': {
    type: 'erc20',
    name: 'Optimism',
    symbol: 'OP',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/10/erc20/0x4200000000000000000000000000000000000042.png',
    occurrences: 11,
    aggregators: [
      'uniswap',
      'oneInch',
      'liFi',
      'socket',
      'rubic',
      'squid',
      'rango',
      'sonarwatch',
      'sushiSwap',
    ],
    erc20Permit: true,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      balance: 0,
      approval: 1,
    },
    isContractVerified: false,
    description: {
      en: "OP is the token for the Optimism Collective that governs the Optimism L2 blockchain. The Optimism Collective is a large-scale experiment in digital democratic governance, built to drive rapid and sustainable growth of a decentralized ecosystem, and stewarded by the newly formed Optimism Foundation.OP governs upgrades to the protocol and network parameters, and creates an ongoing system of incentives for projects and users in the Optimism ecosystem. 5.4% of the total token supply will be distributed to projects on Optimism over the next six months via governance. If you're building something in the Ethereum ecosystem, you can consider applying for the grant.",
    },
  },
  'eip155:59144/erc20:0x374D7860c4f2f604De0191298dD393703Cce84f3': {
    type: 'erc20',
    name: 'Aave v3 USDC',
    symbol: 'AUSDC',
    decimals: 6,
    occurrences: 5,
    aggregators: ['metamask', 'oneInch', 'liFi', 'rubic', 'rango'],
    storage: {
      approval: 53,
    },
    isContractVerified: true,
  },
  'eip155:10/erc20:0xEcF46257ed31c329F204Eb43E254C609dee143B3': {
    type: 'erc20',
    name: 'RigoBlock',
    symbol: 'GRG',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/10/erc20/0xecf46257ed31c329f204eb43e254c609dee143b3.png',
    occurrences: 4,
    aggregators: ['uniswap', 'rubic', 'rango', 'sonarwatch'],
    erc20Permit: false,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      approval: 1,
      balance: 0,
    },
    isContractVerified: true,
    description: {
      en: '"RigoBlock exists to reinvent the asset management industry, making it possible for anyone, anywhere, to set up and manage decentralized token pools which combine the powers of transparency, control, flexibility and governance. By virtue of its modular architecture, developers can build their own distributed asset management platforms atop of the RigoBlock protocol and leverage the unique technology made available by RigoBlock protocol and the Rigo Token (‘GRG’) incentives mechanism. Through the creation of a revolutionary Proof-of-Performance incentive algorithm, RigoBlock removes the need for antiquated management fees to facilitate a new generation of asset management - one built around trust, transparency and simplicity."',
    },
  },
  'eip155:10/erc20:0x4B03afC91295ed778320c2824bAd5eb5A1d852DD': {
    type: 'erc20',
    name: 'NBL',
    symbol: 'NBL',
    decimals: 18,
    occurrences: 3,
    aggregators: ['sonarwatch', 'rubic', 'rango'],
    erc20Permit: true,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      approval: 1,
      balance: 0,
    },
    isContractVerified: true,
  },
  'eip155:8453/erc20:0xfF62dDfa80E513114C3a0bf4d6fFff1c1D17aADf': {
    type: 'erc20',
    name: 'Boe',
    symbol: 'BOE',
    decimals: 18,
    occurrences: 4,
    aggregators: ['coinGecko', 'rubic', 'rango', 'sonarwatch'],
    erc20Permit: false,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      approval: 8,
      balance: 7,
    },
    isContractVerified: true,
  },
  'eip155:42161/erc20:0x912CE59144191C1204E64559FE8253a0e49E6548': {
    type: 'erc20',
    name: 'Arbitrum',
    symbol: 'ARB',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/42161/erc20/0x912ce59144191c1204e64559fe8253a0e49e6548.png',
    occurrences: 9,
    aggregators: [
      'traderJoe',
      'oneInch',
      'liFi',
      'socket',
      'rubic',
      'squid',
      'rango',
      'sonarwatch',
      'sushiSwap',
    ],
    erc20Permit: true,
    honeypotStatus: {},
    storage: {
      balance: 51,
      approval: 52,
    },
    isContractVerified: true,
    description: {
      en: 'Arbitrum is one of the leading Ethereum scaling solutions bringing cheap transactions to tens of thousands of users in an environment that feels very similar to Ethereum. It is an optimistic rollup and the leading L2 in terms of TVL. Some of the largest dApps live on Arbitrum include GMX, Radiant, Uniswap V3, and Gains Network.',
    },
  },
  'eip155:42161/erc20:0x539bdE0d7Dbd336b79148AA742883198BBF60342': {
    type: 'erc20',
    name: 'MAGIC',
    symbol: 'MAGIC',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/42161/erc20/0x539bde0d7dbd336b79148aa742883198bbf60342.png',
    occurrences: 8,
    aggregators: [
      'traderJoe',
      'oneInch',
      'liFi',
      'rubic',
      'squid',
      'rango',
      'sonarwatch',
      'sushiSwap',
    ],
    erc20Permit: true,
    honeypotStatus: {},
    storage: {
      approval: 52,
      balance: 51,
    },
    isContractVerified: true,
  },
  'eip155:1/erc20:0xE52d53c8C9aa7255F8c2FA9f7093FEa7192D2933': {
    type: 'erc20',
    name: 'yield-farming.io',
    symbol: 'YIELDX',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/1/erc20/0xe52d53c8c9aa7255f8c2fa9f7093fea7192d2933.png',
    occurrences: 2,
    aggregators: ['coinMarketCap', 'rubic'],
    erc20Permit: false,
    fees: {
      avgFee: 2.499999999999999,
      maxFee: 2.5,
      minFee: 2.5,
    },
    honeypotStatus: {
      honeypotIs: false,
      goPlus: false,
    },
    storage: {
      balance: 0,
      approval: 1,
    },
    isContractVerified: true,
  },
  'eip155:56/erc20:0x0400Ff00fFd395Ef93E701aE27087A7eeeb84f32': {
    type: 'erc20',
    name: 'ZooBit.Org',
    symbol: 'ZB',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/56/erc20/0x0400ff00ffd395ef93e701ae27087a7eeeb84f32.png',
    occurrences: 2,
    aggregators: ['rubic', 'rango'],
    storage: {
      approval: 2,
      balance: 1,
    },
    isContractVerified: true,
  },
  'eip155:1/erc20:0xbaA70614C7AAfB568a93E62a98D55696bcc85DFE': {
    type: 'erc20',
    name: 'UniCap.finance',
    symbol: 'UCAP',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/1/erc20/0xbaa70614c7aafb568a93e62a98d55696bcc85dfe.png',
    occurrences: 2,
    aggregators: ['coinMarketCap', 'rubic'],
    erc20Permit: false,
    fees: {
      avgFee: 0,
      maxFee: 0,
      minFee: 0,
    },
    honeypotStatus: {
      honeypotIs: true,
      goPlus: false,
    },
    storage: {
      balance: 4,
      approval: 5,
    },
    isContractVerified: true,
  },
  'eip155:1/erc20:0x9D24364b97270961b2948734aFe8d58832Efd43a': {
    type: 'erc20',
    name: 'yefam.finance',
    symbol: 'FAM',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/1/erc20/0x9d24364b97270961b2948734afe8d58832efd43a.png',
    occurrences: 1,
    aggregators: ['rubic'],
    erc20Permit: false,
    fees: {
      maxFee: 0,
      avgFee: 0,
      minFee: 0,
    },
    honeypotStatus: {
      honeypotIs: true,
      goPlus: false,
    },
    storage: {
      balance: 0,
      approval: 1,
    },
    isContractVerified: true,
  },
  'eip155:8453/erc20:0xfB18511F1590a494360069F3640c27d55c2B5290': {
    type: 'erc20',
    name: 'Wild Goat Coin',
    symbol: 'WGC',
    decimals: 6,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/8453/erc20/0xfb18511f1590a494360069f3640c27d55c2b5290.png',
    occurrences: 2,
    aggregators: ['rubic', 'rango'],
    erc20Permit: true,
    storage: {
      approval: 6,
      balance: 5,
    },
    isContractVerified: true,
  },
  'eip155:10/erc20:0xad984fBd3Fb10d0B47D561bE7295685aF726fDb3': {
    type: 'erc20',
    name: 'LARRY TALBOT',
    symbol: 'LARRY',
    decimals: 18,
    occurrences: 1,
    aggregators: ['rubic'],
    fees: {
      maxFee: 0,
      avgFee: 0,
      minFee: 0,
    },
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      balance: 0,
      approval: 1,
    },
    isContractVerified: true,
  },
  'eip155:8453/erc20:0xAfB5d4d474693e68Df500c9c682E6A2841f9661A': {
    type: 'erc20',
    name: 'Bloomer',
    symbol: 'BLOOM',
    decimals: 18,
    occurrences: 1,
    aggregators: ['rango'],
    erc20Permit: false,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      balance: 0,
      approval: 1,
    },
    isContractVerified: true,
  },
  'eip155:8453/erc20:0x340C070260520ae477b88CAA085a33531897145b': {
    type: 'erc20',
    name: 'Shigure UI',
    symbol: '9MM',
    decimals: 18,
    occurrences: 1,
    aggregators: ['rubic'],
    erc20Permit: false,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      balance: 7,
      approval: 8,
    },
    isContractVerified: true,
  },
  'eip155:1/erc20:0x82866b4A71BA9d930Fe338C386B6A45a7133eb36': {
    type: 'erc20',
    name: 'QCORE.FINANCE',
    symbol: 'QCORE',
    decimals: 9,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/1/erc20/0x82866b4a71ba9d930fe338c386b6a45a7133eb36.png',
    occurrences: 2,
    aggregators: ['coinMarketCap', 'rubic'],
    erc20Permit: false,
    fees: {
      avgFee: 0,
      maxFee: 0,
      minFee: 0,
    },
    honeypotStatus: {
      honeypotIs: true,
      goPlus: false,
    },
    storage: {
      balance: 3,
      approval: 4,
    },
    isContractVerified: true,
  },
  'eip155:1/erc20:0x43e6228b5bF22Eab754486082cA91FdD8585521A': {
    type: 'erc20',
    name: 'DIXT.FINANCE',
    symbol: 'DIXT',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/1/erc20/0x43e6228b5bf22eab754486082ca91fdd8585521a.png',
    occurrences: 2,
    aggregators: ['coinMarketCap', 'rubic'],
    erc20Permit: false,
    fees: {
      avgFee: 0,
      maxFee: 0,
      minFee: 0,
    },
    honeypotStatus: {
      honeypotIs: false,
      goPlus: false,
    },
    storage: {
      balance: 0,
      approval: 1,
    },
    isContractVerified: true,
  },
  'eip155:1/erc20:0x5380442d3C4EC4f5777f551f5EDD2FA0F691A27C': {
    type: 'erc20',
    name: 'UkraineDAO Flag NFT',
    symbol: 'LOVE',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/1/erc20/0x5380442d3c4ec4f5777f551f5edd2fa0f691a27c.png',
    occurrences: 2,
    aggregators: ['coinMarketCap', 'rubic'],
    erc20Permit: false,
    fees: {
      avgFee: 0,
      maxFee: 0,
      minFee: 0,
    },
    honeypotStatus: {
      honeypotIs: false,
    },
    storage: {
      balance: 51,
      approval: 52,
    },
    isContractVerified: true,
    description: {
      en: '$LOVE token was donated to everyone who donated to the UkraineDAO Party Bid and for everyone who donated directly to the ukrainedao.eth prior to the snapshot on Mar 3. The $LOVE token is a symbol, not a utility, commemorating the donor’s contribution. Seeing these tokens or other POAPs in one’s wallet reminds people of the bigger picture behind Web3 building and decentralized organizations.',
    },
  },
  'eip155:1/erc20:0x6051C1354Ccc51b4d561e43b02735DEaE64768B8': {
    type: 'erc20',
    name: 'yRise.Finance',
    symbol: 'YRISE',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/1/erc20/0x6051c1354ccc51b4d561e43b02735deae64768b8.png',
    occurrences: 2,
    aggregators: ['coinMarketCap', 'rubic'],
    erc20Permit: false,
    fees: {
      avgFee: 0,
      maxFee: 0,
      minFee: 0,
    },
    honeypotStatus: {
      honeypotIs: false,
      goPlus: false,
    },
    storage: {
      balance: 4,
      approval: 5,
    },
    isContractVerified: true,
  },
  'eip155:8453/erc20:0x160452f95612699D1a561A70EEEeeDe67c6812af': {
    type: 'erc20',
    name: 'Base Lord',
    symbol: 'BORD',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/8453/erc20/0x160452f95612699d1a561a70eeeeede67c6812af.png',
    occurrences: 1,
    aggregators: ['rango'],
    erc20Permit: false,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      balance: 0,
      approval: 1,
    },
    isContractVerified: true,
    description: {
      en: 'BORD is an original memecoin project aimed at bringing more users to the Base chain with its fun, clever, and nostalgic memes. BORD has a strong community focus that strives to show old and new crypto enthusiasts the power of the based side, with the help of its rich lore and storytelling.',
    },
  },
  'eip155:10/erc20:0x67631FF69130ea1a6c4feaA4A0Abf0a1E0148be7': {
    type: 'erc20',
    name: 'Wild Goat Coin',
    symbol: 'WGC',
    decimals: 6,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/10/erc20/0x67631ff69130ea1a6c4feaa4a0abf0a1e0148be7.png',
    occurrences: 2,
    aggregators: ['rubic', 'rango'],
    fees: {
      maxFee: 0,
      avgFee: 0,
      minFee: 0,
    },
    storage: {
      balance: 5,
      approval: 6,
    },
    isContractVerified: true,
    description: {
      en: 'Memecoin / Digital Collectible',
    },
  },
  'eip155:8453/erc20:0x4F6e6B8efC7CfB23DBD53C1B09F7389eF8191693': {
    type: 'erc20',
    name: 'AI Love Meme',
    symbol: 'AILM',
    decimals: 18,
    occurrences: 1,
    aggregators: ['rubic'],
    honeypotStatus: {
      goPlus: false,
    },
    isContractVerified: true,
  },
  'eip155:137/erc20:0x3C0Bd2118a5E61C41d2aDeEBCb8B7567FDE1cBaF': {
    type: 'erc20',
    name: 'Cookie',
    symbol: 'CKIE',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/137/erc20/0x3c0bd2118a5e61c41d2adeebcb8b7567fde1cbaf.png',
    occurrences: 1,
    aggregators: ['rubic'],
    erc20Permit: false,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      balance: 0,
      approval: 1,
    },
    isContractVerified: true,
  },
  'eip155:137/erc20:0x9E2d266D6c90F6C0D80a88159b15958f7135B8Af': {
    type: 'erc20',
    name: 'StakeShare',
    symbol: 'SSX',
    decimals: 18,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/137/erc20/0x9e2d266d6c90f6c0d80a88159b15958f7135b8af.png',
    occurrences: 1,
    aggregators: ['rubic'],
    erc20Permit: false,
    fees: {
      avgFee: 0,
      maxFee: 0,
      minFee: 0,
    },
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      balance: 3,
      approval: 1,
    },
    isContractVerified: true,
  },
  'eip155:8453/erc20:0x9A27C6759A6de0F26Ac41264f0856617DeC6bC3F': {
    type: 'erc20',
    name: 'Monkey Peepo',
    symbol: 'BANANAS',
    decimals: 18,
    occurrences: 2,
    aggregators: ['rubic', 'rango'],
    erc20Permit: false,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      approval: 1,
      balance: 0,
    },
    isContractVerified: true,
  },
  'eip155:8453/erc20:0x41e357ea17eEd8e3Ee32451F8E5CBa824AF58Dbf': {
    type: 'erc20',
    name: 'Coinbase Wrapped XRP',
    symbol: 'CBXRP',
    decimals: 18,
    occurrences: 1,
    aggregators: ['rubic'],
  },
  'eip155:8453/erc20:0xC5a861787f3e173F2b004d5cfA6a717f5DC5484D': {
    type: 'erc20',
    name: 'Snow Leopard',
    symbol: 'SNL',
    decimals: 18,
    occurrences: 1,
    aggregators: ['rubic'],
  },
  'eip155:8453/erc20:0x80E3Ee7bAB68fEAea6e01c44df9daa5de53e4818': {
    type: 'erc20',
    name: 'DOGECOIN',
    symbol: 'DOGE',
    decimals: 9,
    occurrences: 1,
    aggregators: ['rubic'],
    erc20Permit: false,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      balance: 1,
      approval: 2,
    },
    isContractVerified: true,
  },
  'eip155:8453/erc20:0x478e03D45716dDa94F6DbC15A633B0D90c237E2F': {
    type: 'erc20',
    name: 'Shaka',
    symbol: '$SHAKA',
    decimals: 18,
    occurrences: 2,
    aggregators: ['rubic', 'rango'],
    erc20Permit: false,
    honeypotStatus: {
      goPlus: false,
    },
    storage: {
      approval: 1,
      balance: 0,
    },
    isContractVerified: true,
  },
  'eip155:8453/erc20:0x491B67a94Ec0a59b81b784F4719d0387C4510c36': {
    type: 'erc20',
    name: 'Purple Frog',
    symbol: 'PF',
    decimals: 18,
    occurrences: 2,
    aggregators: ['rubic', 'rango'],
    storage: {
      approval: 1,
      balance: 0,
    },
    isContractVerified: true,
  },
};

/** Native asset id per chain, verbatim from the state log. */
export const SCAM_WALLET_NATIVE_ASSET_IDENTIFIERS = {
  'eip155:1': 'eip155:1/slip44:60',
  'eip155:10': 'eip155:10/slip44:60',
  'eip155:10143': 'eip155:10143/slip44:1',
  'eip155:11155111': 'eip155:11155111/slip44:1',
  'eip155:137': 'eip155:137/slip44:966',
  'eip155:143': 'eip155:143/slip44:268435779',
  'eip155:42161': 'eip155:42161/slip44:60',
  'eip155:4663': 'eip155:4663/slip44:60',
  'eip155:534352': 'eip155:534352/slip44:60',
  'eip155:56': 'eip155:56/slip44:714',
  'eip155:59141': 'eip155:59141/slip44:1',
  'eip155:59144': 'eip155:59144/slip44:60',
  'eip155:6343': 'eip155:6343/slip44:60',
  'eip155:8453': 'eip155:8453/slip44:60',
};

/**
 * The asset ids the sweep is expected to keep: every asset except the
 * sub-floor ERC-20 spam. Computed once the captured occurrence counts are
 * known; exported here so the integration test asserts the exact survivor
 * set.
 */
/**
 * The sub-floor ERC-20 airdrop spam the sweep is expected to drop, computed
 * from the captured occurrence counts in `api-responses/`. Each sits below its
 * chain's floor (3 everywhere except the thin Monad/Linea-style chains) and is
 * neither custom nor mUSD.
 */
export const SCAM_WALLET_SPAM_ASSET_IDS = [
  'eip155:137/erc20:0xEDcFb6984a3c70501BAA8b7f5421Ae795ecC1496',
  'eip155:10/erc20:0x4B03afC91295ed778320c2824bAd5eb5A1d852DD',
  'eip155:1/erc20:0xE52d53c8C9aa7255F8c2FA9f7093FEa7192D2933',
  'eip155:56/erc20:0x0400Ff00fFd395Ef93E701aE27087A7eeeb84f32',
  'eip155:1/erc20:0xbaA70614C7AAfB568a93E62a98D55696bcc85DFE',
  'eip155:1/erc20:0x9D24364b97270961b2948734aFe8d58832Efd43a',
  'eip155:8453/erc20:0xfB18511F1590a494360069F3640c27d55c2B5290',
  'eip155:10/erc20:0xad984fBd3Fb10d0B47D561bE7295685aF726fDb3',
  'eip155:8453/erc20:0xAfB5d4d474693e68Df500c9c682E6A2841f9661A',
  'eip155:8453/erc20:0x340C070260520ae477b88CAA085a33531897145b',
  'eip155:1/erc20:0x82866b4A71BA9d930Fe338C386B6A45a7133eb36',
  'eip155:1/erc20:0x43e6228b5bF22Eab754486082cA91FdD8585521A',
  'eip155:1/erc20:0x5380442d3C4EC4f5777f551f5EDD2FA0F691A27C',
  'eip155:1/erc20:0x6051C1354Ccc51b4d561e43b02735DEaE64768B8',
  'eip155:8453/erc20:0x160452f95612699D1a561A70EEEeeDe67c6812af',
  'eip155:10/erc20:0x67631FF69130ea1a6c4feaA4A0Abf0a1E0148be7',
  'eip155:8453/erc20:0x4F6e6B8efC7CfB23DBD53C1B09F7389eF8191693',
  'eip155:137/erc20:0x3C0Bd2118a5E61C41d2aDeEBCb8B7567FDE1cBaF',
  'eip155:137/erc20:0x9E2d266D6c90F6C0D80a88159b15958f7135B8Af',
  'eip155:8453/erc20:0x9A27C6759A6de0F26Ac41264f0856617DeC6bC3F',
  'eip155:8453/erc20:0x41e357ea17eEd8e3Ee32451F8E5CBa824AF58Dbf',
  'eip155:8453/erc20:0xC5a861787f3e173F2b004d5cfA6a717f5DC5484D',
  'eip155:8453/erc20:0x80E3Ee7bAB68fEAea6e01c44df9daa5de53e4818',
  'eip155:8453/erc20:0x478e03D45716dDa94F6DbC15A633B0D90c237E2F',
  'eip155:8453/erc20:0x491B67a94Ec0a59b81b784F4719d0387C4510c36',
] as Caip19AssetId[];

/**
 * Everything that must survive the sweep: the genuine holdings that clear the
 * floor, the hand-imported custom asset, the mUSD entries, plus every native
 * and non-EVM asset (which the occurrence filter never touches). Derived from
 * the captured responses; asserted as the exact post-sweep `assetsInfo` keys.
 */
export const SCAM_WALLET_SURVIVING_ASSET_IDS = (
  Object.keys(SCAM_WALLET_ASSETS_INFO) as Caip19AssetId[]
).filter(
  (assetId) =>
    !SCAM_WALLET_SPAM_ASSET_IDS.some(
      (spamId) => spamId.toLowerCase() === assetId.toLowerCase(),
    ),
);

/**
 * Build the example scam wallet's controller state. All assets are tracked
 * under a single synthetic account's balances (plus the real custom-asset
 * account) so the sweep's per-account balance cleanup is exercised.
 *
 * @param overrides - State slices to replace wholesale.
 * @returns Full internal controller state.
 */
export function buildScamWalletState(
  overrides: Partial<AssetsControllerStateInternal> = {},
): AssetsControllerStateInternal {
  const assetsInfo = SCAM_WALLET_ASSETS_INFO as Record<
    Caip19AssetId,
    AssetMetadata
  >;
  return {
    assetsInfo,
    assetsBalance: {
      [SCAM_WALLET_ACCOUNT_ID]: Object.fromEntries(
        Object.keys(assetsInfo).map((assetId) => [
          assetId,
          { amount: '1000000000000000000' },
        ]),
      ),
    },
    assetsPrice: {},
    customAssets: { ...SCAM_WALLET_CUSTOM_ASSETS },
    assetPreferences: {},
    selectedCurrency: 'usd',
    ...overrides,
  };
}
