import type { CaipAssetType } from '@metamask/utils';

/**
 * Maps each SUPPORTED_CURRENCIES entry to its CAIP-19 (or CAIP-like) identifier.
 * For fiat, we mimic the old “swift:0/iso4217:XYZ” style.
 */
export const MAP_CAIP_CURRENCIES: {
  [key: string]: CaipAssetType | undefined;
} = {
  // ========================
  // Native crypto assets
  // ========================
  btc: 'bip122:000000000019d6689c085ae165831e93/slip44:0',
  eth: 'eip155:1/slip44:60',
  ltc: 'bip122:12a765e31ffd4059bada1e25190f6e98/slip44:2',

  // Bitcoin Cash
  bch: 'bip122:000000000000000000651ef99cb9fcbe/slip44:145',

  // Binance Coin
  bnb: 'cosmos:Binance-Chain-Tigris/slip44:714',

  // EOS mainnet (chainId = aca376f2...)
  eos: 'eos:aca376f2/slip44:194',

  // XRP mainnet
  xrp: 'xrpl:mainnet/slip44:144',

  // Stellar Lumens mainnet
  xlm: 'stellar:pubnet/slip44:148',

  // Chainlink (ERC20 on Ethereum mainnet)
  link: 'eip155:1/erc20:0x514910771af9Ca656af840dff83E8264EcF986CA',

  // Polkadot (chainId = 91b171bb158e2d3848fa23a9f1c25182)
  dot: 'polkadot:91b171bb158e2d3848fa23a9f1c25182/slip44:354',

  // Yearn.finance (ERC20 on Ethereum mainnet)
  yfi: 'eip155:1/erc20:0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e',

  // ========================
  // Fiat currencies
  // ========================
  usd: 'swift:0/iso4217:USD',
  aed: 'swift:0/iso4217:AED',
  ars: 'swift:0/iso4217:ARS',
  aud: 'swift:0/iso4217:AUD',
  bdt: 'swift:0/iso4217:BDT',
  bhd: 'swift:0/iso4217:BHD',
  bmd: 'swift:0/iso4217:BMD',
  brl: 'swift:0/iso4217:BRL',
  cad: 'swift:0/iso4217:CAD',
  chf: 'swift:0/iso4217:CHF',
  clp: 'swift:0/iso4217:CLP',
  cny: 'swift:0/iso4217:CNY',
  czk: 'swift:0/iso4217:CZK',
  dkk: 'swift:0/iso4217:DKK',
  eur: 'swift:0/iso4217:EUR',
  gbp: 'swift:0/iso4217:GBP',
  hkd: 'swift:0/iso4217:HKD',
  huf: 'swift:0/iso4217:HUF',
  idr: 'swift:0/iso4217:IDR',
  ils: 'swift:0/iso4217:ILS',
  inr: 'swift:0/iso4217:INR',
  jpy: 'swift:0/iso4217:JPY',
  krw: 'swift:0/iso4217:KRW',
  kwd: 'swift:0/iso4217:KWD',
  lkr: 'swift:0/iso4217:LKR',
  mmk: 'swift:0/iso4217:MMK',
  mxn: 'swift:0/iso4217:MXN',
  myr: 'swift:0/iso4217:MYR',
  ngn: 'swift:0/iso4217:NGN',
  nok: 'swift:0/iso4217:NOK',
  nzd: 'swift:0/iso4217:NZD',
  php: 'swift:0/iso4217:PHP',
  pkr: 'swift:0/iso4217:PKR',
  pln: 'swift:0/iso4217:PLN',
  rub: 'swift:0/iso4217:RUB',
  sar: 'swift:0/iso4217:SAR',
  sek: 'swift:0/iso4217:SEK',
  sgd: 'swift:0/iso4217:SGD',
  thb: 'swift:0/iso4217:THB',
  try: 'swift:0/iso4217:TRY',
  twd: 'swift:0/iso4217:TWD',
  uah: 'swift:0/iso4217:UAH',
  vef: 'swift:0/iso4217:VEF',
  vnd: 'swift:0/iso4217:VND',
  zar: 'swift:0/iso4217:ZAR',
  xdr: 'swift:0/iso4217:XDR',
  xag: 'swift:0/iso4217:XAG',
  xau: 'swift:0/iso4217:XAU',

  // ========================
  // Non-standard sub-units
  // ========================
  bits: undefined, // no official CAIP reference for bits
  sats: undefined, // no official CAIP reference for satoshis
};
