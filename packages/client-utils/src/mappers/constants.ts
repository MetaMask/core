// Known method IDs for supply/deposit calls
const aaveSupplyMethodId = '0x617ba037';
const lidoSubmitMethodId = '0xa1903eab';
const lidoDepositMethodId = '0x8a99b4f2'; // MM staking contract Lido deposit
const rocketPoolDepositMethodId = '0xfa4bbb71'; // MM staking contract RP deposit

export const supplyMethodIds = new Set([
  aaveSupplyMethodId,
  lidoSubmitMethodId,
  lidoDepositMethodId,
  rocketPoolDepositMethodId,
]);

// Known method IDs for withdraw calls
const aaveWithdrawMethodId = '0x69328dec';
const lidoClaimWithdrawMethodId = '0xf8444436';
const rocketPoolBurnMethodId = '0x42966c68';

export const withdrawMethodIds = new Set([
  aaveWithdrawMethodId,
  lidoClaimWithdrawMethodId,
  rocketPoolBurnMethodId,
]);

export const wrapMethodIds = new Set(['0xd0e30db0']);
export const unwrapMethodIds = new Set(['0x2e1a7d4d']);

export const permit2ApproveMethodId = '0x87517c45';

export const tokenTransferLogTopicHash =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export const nativeTokenAddress = '0x0000000000000000000000000000000000000000';

export const swapsWrappedTokensAddresses = {
  '0x1': '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  '0x539': '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  '0x38': '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
  '0x89': '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270',
  '0x5': '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6',
  '0xa86a': '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7',
  '0xa': '0x4200000000000000000000000000000000000006',
  '0xa4b1': '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
  '0x144': '0x5AEa5775959fBC2557Cc8789bC1bf90A239D9a91',
  '0xe708': '0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f',
  '0x2105': '0x4200000000000000000000000000000000000006',
  '0x531': '0xe30fedd158a2e3b13e9badaeabafc5516e95e8c7',
  '0x8f': '0x3bd359c1119da7da1d913d1c4d2b7c461115433a',
  '0x3e7': '0x5555555555555555555555555555555555555555',
  '0x10e6': '0x4200000000000000000000000000000000000006',
} as const;
