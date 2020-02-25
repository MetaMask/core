import { AssetsContractController } from '../src/assets/AssetsContractController';
import { MAINNET_PROVIDER, GODSADDRESS, CKADDRESS, SAI_ADDRESS } from '../src/constants';

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

	it('should get collectible name', async () => {
		assetsContract.configure({ provider: MAINNET_PROVIDER });
		const name = await assetsContract.getAssetName(GODSADDRESS);
		expect(name).toEqual('Gods Unchained');
	});
	it('should get collectible symbol', async () => {
		assetsContract.configure({ provider: MAINNET_PROVIDER });
		const symbol = await assetsContract.getAssetSymbol(GODSADDRESS);
		expect(symbol).toEqual('GODS');
	});

	it('should get token decimals', async () => {
		assetsContract.configure({ provider: MAINNET_PROVIDER });
		const symbol = await assetsContract.getTokenDecimals(SAI_ADDRESS);
		expect(Number(symbol)).toEqual(18);
	});

	it('should get collectible ownership', async () => {
		assetsContract.configure({ provider: MAINNET_PROVIDER });
		const tokenId = await assetsContract.getOwnerOf(GODSADDRESS, 148332);
		expect(tokenId).not.toEqual('');
	});

	it('should get balances in a single call', async () => {
		assetsContract.configure({ provider: MAINNET_PROVIDER });
		const balances = await assetsContract.getBalancesInSingleCall(SAI_ADDRESS, [SAI_ADDRESS]);
		expect(balances[SAI_ADDRESS]).not.toEqual(0);
	});
});
