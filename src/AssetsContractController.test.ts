import { AssetsContractController } from './AssetsContractController';
const HttpProvider = require('ethjs-provider-http');
const MAINNET_PROVIDER = new HttpProvider('https://mainnet.infura.io');
const GODSADDRESS = '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab';
const CKADDRESS = '0x06012c8cf97BEaD5deAe237070F9587f8E7A266d';
const DAI_ADDRESS = '0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359';

describe('AssetsContractController', () => {
	let assetsContract: AssetsContractController;

	beforeEach(() => {
		assetsContract = new AssetsContractController();
	});

	it('should set default config', () => {
		expect(assetsContract.config).toEqual({
			provider: undefined
		});
	});

	it('should determine if contract supports interface correctly', async () => {
		assetsContract.configure({ provider: MAINNET_PROVIDER });
		const CKSupportsEnumerable = await assetsContract.contractSupportsEnumerableInterface(CKADDRESS);
		const GODSSupportsEnumerable = await assetsContract.contractSupportsEnumerableInterface(GODSADDRESS);
		expect(CKSupportsEnumerable).toBe(false);
		expect(GODSSupportsEnumerable).toBe(true);
	});

	it('should get balance of contract correctly', async () => {
		assetsContract.configure({ provider: MAINNET_PROVIDER });
		const CKBalance = await assetsContract.getBalanceOf(CKADDRESS, '0xb1690c08e213a35ed9bab7b318de14420fb57d8c');
		const CKNoBalance = await assetsContract.getBalanceOf(CKADDRESS, '0xb1690c08e213a35ed9bab7b318de14420fb57d81');
		expect(CKBalance.toNumber()).not.toEqual(0);
		expect(CKNoBalance.toNumber()).toEqual(0);
	});

	it('should get collectible tokenId correctly', async () => {
		assetsContract.configure({ provider: MAINNET_PROVIDER });
		const tokenId = await assetsContract.getCollectibleTokenId(
			GODSADDRESS,
			'0x9a90bd8d1149a88b42a99cf62215ad955d6f498a',
			0
		);
		expect(tokenId).not.toEqual(0);
	});

	it('should get collectible tokenURI correctly', async () => {
		assetsContract.configure({ provider: MAINNET_PROVIDER });
		const tokenId = await assetsContract.getCollectibleTokenURI(GODSADDRESS, 0);
		expect(tokenId).toEqual('https://api.godsunchained.com/card/0');
	});

	it('should get collectible ownership', async () => {
		assetsContract.configure({ provider: MAINNET_PROVIDER });
		const tokenId = await assetsContract.getOwnerOf(GODSADDRESS, 148332);
		expect(tokenId).not.toEqual('');
	});

	it('should get balances in a single call', async () => {
		assetsContract.configure({ provider: MAINNET_PROVIDER });
		const balances = await assetsContract.getBalancesInSingleCall(DAI_ADDRESS, [DAI_ADDRESS]);
		expect(balances[DAI_ADDRESS]).not.toEqual(0);
	});
});
