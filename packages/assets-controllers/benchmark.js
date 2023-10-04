const { AssetsContractController } = require('./');
const HttpProvider = require('ethjs-provider-http');
const { Contract } = require('@ethersproject/contracts');
const { Web3Provider } = require('@ethersproject/providers');

(async function main() {

  // Use same provider for both approaches
  const provider = new HttpProvider(
    `https://sepolia.infura.io/v3/<OMITTED>`
  );

  // Existing approach of multiple RPC calls
  const controller = new AssetsContractController({
    chainId: 11155111,
    onPreferencesStateChange: () => { },
    onNetworkStateChange: () => { },
    getNetworkClientById: () => ({ provider })
  });

  // Take average time of <n> requests
  const count = 10;
  let start = performance.now();
  for (let i = 0; i < count; i++) {
    details = await controller.getTokenStandardAndDetails(
      "0x5974D2B77eedae32B576b0ADF32373a339d73833",
      "0x9f36f6073a1e27d93c767d899470fb8eeaf8ae86",
      undefined,
      'sepolia'
    );
  }
  console.log((performance.now() - start) / count);
  console.log(details);

  // Smart contract approach
  const abi = [
    {
      "name": "getTokenStandardAndDetails", "stateMutability": "view", "type": "function",
      "inputs": [
        { "internalType": "address", "name": "tokenAddress", "type": "address" },
        { "internalType": "address", "name": "userAddress", "type": "address" }
      ],
      "outputs": [{
        "components": [
          { "internalType": "string", "name": "standard", "type": "string" },
          { "internalType": "string", "name": "tokenURI", "type": "string" },
          { "internalType": "string", "name": "symbol", "type": "string" },
          { "internalType": "string", "name": "name", "type": "string" },
          { "internalType": "uint8", "name": "decimals", "type": "uint8" },
          { "internalType": "uint256", "name": "balance", "type": "uint256" }
        ],
        "internalType": "struct GetTokenStandardAndDetails.StandardAndDetails",
        "name": "", "type": "tuple"
      }],
    },
    // 2 other function overloads are omitted
  ];

  const contract = new Contract("0xa596fefb77219145394151c5d7380932abfacc73",
    abi, new Web3Provider(provider))['getTokenStandardAndDetails(address,address)'];

  // Take average time of <n> requests
  start = performance.now();
  for (let i = 0; i < count; i++) {
    details = await contract(
      "0x5974D2B77eedae32B576b0ADF32373a339d73833",
      "0x9f36f6073a1e27d93c767d899470fb8eeaf8ae86");
  }
  console.log((performance.now() - start) / count);
  const { decimals, symbol, balance, standard } = details;
  console.log({ decimals, symbol, balance, standard })

})().catch(e => { console.error(e) })

// 2277.029479202628
// {
//   decimals: '4',
//   symbol: 'TST',
//   balance: <BN: 186a0>,
//   standard: 'ERC20'
// }

// 396.6844749987125
// {
//   decimals: 4,
//   symbol: 'TST',
//   balance: BigNumber { _hex: '0x0186a0', _isBigNumber: true },
//   standard: 'ERC20'
// }
