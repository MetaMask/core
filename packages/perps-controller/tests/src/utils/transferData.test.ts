import { generateERC20TransferData } from '../../../src/utils/transferData';

describe('generateERC20TransferData', () => {
  it('encodes ERC-20 transfer calldata', () => {
    expect(
      generateERC20TransferData(
        '0x000000000000000000000000000000000000dEaD',
        '0x64',
      ),
    ).toBe(
      '0xa9059cbb000000000000000000000000000000000000000000000000000000000000dead0000000000000000000000000000000000000000000000000000000000000064',
    );
  });

  it('requires both recipient and amount', () => {
    expect(() => generateERC20TransferData('', '0x64')).toThrow(
      "'toAddress' and 'amount' must be defined",
    );
    expect(() =>
      generateERC20TransferData(
        '0x000000000000000000000000000000000000dEaD',
        '',
      ),
    ).toThrow("'toAddress' and 'amount' must be defined");
  });
});
