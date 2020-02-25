const HttpProvider = require('ethjs-provider-http');
const PROJECT_ID: string = '341eacb578dd44a1a049cbc5f6fd4035';
const ROPSTEN_PROJECT_ID: string = '341eacb578dd44a1a049cbc5f6fd4035';
const MAINNET_PROVIDER_URL: string = 'https://mainnet.infura.io/v3/';
const ROPSTEN_PROVIDER_URL: string = 'ropsten.infura.io/v3/';
const OPEN_SEA_API: string = 'https://api.opensea.io/api/v1/';
const KUDOSADDRESS: string = '0x2aea4add166ebf38b63d09a75de1a7b94aa24163';
const GODSADDRESS: string = '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab';
const CKADDRESS: string = '0x06012c8cf97BEaD5deAe237070F9587f8E7A266d';
const SAI_ADDRESS: string = '0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359';
const MAINNET_PROVIDER = new HttpProvider(`${MAINNET_PROVIDER_URL}${PROJECT_ID}`);
const ROPSTEN_PROVIDER = new HttpProvider(`${ROPSTEN_PROVIDER_URL}${ROPSTEN_PROJECT_ID}`);

export { MAINNET_PROVIDER, ROPSTEN_PROVIDER, OPEN_SEA_API, KUDOSADDRESS, GODSADDRESS, CKADDRESS, SAI_ADDRESS };
