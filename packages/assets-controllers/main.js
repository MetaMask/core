const { NftDetectionController, NftController } = require('.');

// Not to be committed - for Brian's testing
(async function main() {
  const nft = new NftController(
    {
      chainId: '0x1',
      onPreferencesStateChange: () => '',
      onNetworkStateChange: () => '',
      getERC721AssetName: () => '',
      getERC721AssetSymbol: () => '',
      getERC721TokenURI: () => '',
      getERC721OwnerOf: () => '',
      getERC1155BalanceOf: () => '',
      getERC1155TokenURI: () => '',
      getNetworkClientById: () => '',
      onNftAdded: () => '',
    },
    { disabled: false, chainId: '0x1' },
  );

  const detect = new NftDetectionController(
    {
      chainId: 1,
      getNetworkClientById: () => '',
      onPreferencesStateChange: () => '',
      onNetworkStateChange: () => '',
      addNft: nft.addNft.bind(nft),
      getNftState: () => nft.state,
    },
    { disabled: false, chainId: '0x1' },
  );

  await detect.detectNfts({
    userAddress: '0x037ccb73fd73f956901bcc4851040db81b8769d2',
  });

  await nft.getNftInformationFromApi(
    '0x152888f51beec20975124da76dfa35ba539bbc2d',
    '1',
  );
  await nft.getNftContractInformationFromApi(
    '0x152888f51beec20975124da76dfa35ba539bbc2d',
  );
})().catch((e) => {
  console.error(e);
});
