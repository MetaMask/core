import { toChecksumHexAddress } from '@metamask/controller-utils';
import { EnsController } from './EnsController';

const address1 = '0x32Be343B94f860124dC4fEe278FDCBD38C102D88';
const address2 = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
const address3 = '0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359';
const name1 = 'foobarb.eth';
const name2 = 'bazbarb.eth';

const address1Checksum = toChecksumHexAddress(address1);
const address2Checksum = toChecksumHexAddress(address2);
const address3Checksum = toChecksumHexAddress(address3);

describe('EnsController', () => {
  it('should set default state', () => {
    const controller = new EnsController();
    expect(controller.state).toStrictEqual({ ensEntries: {} });
  });

  it('should add a new ENS entry and return true', () => {
    const controller = new EnsController();
    expect(controller.set('1', name1, address1)).toBe(true);
    expect(controller.state).toStrictEqual({
      ensEntries: {
        1: {
          [name1]: {
            address: address1Checksum,
            chainId: '1',
            ensName: name1,
          },
        },
      },
    });
  });

  it('should add a new ENS entry with null address and return true', () => {
    const controller = new EnsController();
    expect(controller.set('1', name1, null)).toBe(true);
    expect(controller.state).toStrictEqual({
      ensEntries: {
        1: {
          [name1]: {
            address: null,
            chainId: '1',
            ensName: name1,
          },
        },
      },
    });
  });

  it('should update an ENS entry and return true', () => {
    const controller = new EnsController();
    expect(controller.set('1', name1, address1)).toBe(true);
    expect(controller.set('1', name1, address2)).toBe(true);
    expect(controller.state).toStrictEqual({
      ensEntries: {
        1: {
          [name1]: {
            address: address2Checksum,
            chainId: '1',
            ensName: name1,
          },
        },
      },
    });
  });

  it('should update an ENS entry with null address and return true', () => {
    const controller = new EnsController();
    expect(controller.set('1', name1, address1)).toBe(true);
    expect(controller.set('1', name1, null)).toBe(true);
    expect(controller.state).toStrictEqual({
      ensEntries: {
        1: {
          [name1]: {
            address: null,
            chainId: '1',
            ensName: name1,
          },
        },
      },
    });
  });

  it('should not update an ENS entry if the address is the same (valid address) and return false', () => {
    const controller = new EnsController();
    expect(controller.set('1', name1, address1)).toBe(true);
    expect(controller.set('1', name1, address1)).toBe(false);
    expect(controller.state).toStrictEqual({
      ensEntries: {
        1: {
          [name1]: {
            address: address1Checksum,
            chainId: '1',
            ensName: name1,
          },
        },
      },
    });
  });

  it('should not update an ENS entry if the address is the same (null) and return false', () => {
    const controller = new EnsController();
    expect(controller.set('1', name1, null)).toBe(true);
    expect(controller.set('1', name1, null)).toBe(false);
    expect(controller.state).toStrictEqual({
      ensEntries: {
        1: {
          [name1]: {
            address: null,
            chainId: '1',
            ensName: name1,
          },
        },
      },
    });
  });

  it('should add multiple ENS entries and update without side effects', () => {
    const controller = new EnsController();
    expect(controller.set('1', name1, address1)).toBe(true);
    expect(controller.set('1', name2, address2)).toBe(true);
    expect(controller.set('2', name1, address1)).toBe(true);
    expect(controller.set('1', name1, address3)).toBe(true);
    expect(controller.state).toStrictEqual({
      ensEntries: {
        1: {
          [name1]: {
            address: address3Checksum,
            chainId: '1',
            ensName: name1,
          },
          [name2]: {
            address: address2Checksum,
            chainId: '1',
            ensName: name2,
          },
        },
        2: {
          [name1]: {
            address: address1Checksum,
            chainId: '2',
            ensName: name1,
          },
        },
      },
    });
  });

  it('should get ENS entry by chainId and ensName', () => {
    const controller = new EnsController();
    expect(controller.set('1', name1, address1)).toBe(true);
    expect(controller.get('1', name1)).toStrictEqual({
      address: address1Checksum,
      chainId: '1',
      ensName: name1,
    });
  });

  it('should return null when getting nonexistent name', () => {
    const controller = new EnsController();
    expect(controller.set('1', name1, address1)).toBe(true);
    expect(controller.get('1', name2)).toBeNull();
  });

  it('should return null when getting nonexistent chainId', () => {
    const controller = new EnsController();
    expect(controller.set('1', name1, address1)).toBe(true);
    expect(controller.get('2', name1)).toBeNull();
  });

  it('should throw on attempt to set invalid ENS entry: chainId', () => {
    const controller = new EnsController();
    expect(() => {
      controller.set('a', name1, address1);
    }).toThrow(
      'Invalid ENS entry: { chainId:a, ensName:foobarb.eth, address:0x32Be343B94f860124dC4fEe278FDCBD38C102D88}',
    );
    expect(controller.state).toStrictEqual({ ensEntries: {} });
  });

  it('should throw on attempt to set invalid ENS entry: ENS name', () => {
    const controller = new EnsController();
    expect(() => {
      controller.set('1', 'foo.eth', address1);
    }).toThrow('Invalid ENS name: foo.eth');
    expect(controller.state).toStrictEqual({ ensEntries: {} });
  });

  it('should throw on attempt to set invalid ENS entry: address', () => {
    const controller = new EnsController();
    expect(() => {
      controller.set('1', name1, 'foo');
    }).toThrow(
      'Invalid ENS entry: { chainId:1, ensName:foobarb.eth, address:foo}',
    );
    expect(controller.state).toStrictEqual({ ensEntries: {} });
  });

  it('should remove an ENS entry and return true', () => {
    const controller = new EnsController();
    expect(controller.set('1', name1, address1)).toBe(true);
    expect(controller.delete('1', name1)).toBe(true);
    expect(controller.state).toStrictEqual({ ensEntries: {} });
  });

  it('should return false if an ENS entry was NOT deleted', () => {
    const controller = new EnsController();
    controller.set('1', name1, address1);
    expect(controller.delete('1', 'bar')).toBe(false);
    expect(controller.delete('2', 'bar')).toBe(false);
    expect(controller.state).toStrictEqual({
      ensEntries: {
        1: {
          [name1]: {
            address: address1Checksum,
            chainId: '1',
            ensName: name1,
          },
        },
      },
    });
  });

  it('should add multiple ENS entries and remove without side effects', () => {
    const controller = new EnsController();
    expect(controller.set('1', name1, address1)).toBe(true);
    expect(controller.set('1', name2, address2)).toBe(true);
    expect(controller.set('2', name1, address1)).toBe(true);
    expect(controller.delete('1', name1)).toBe(true);
    expect(controller.state).toStrictEqual({
      ensEntries: {
        1: {
          [name2]: {
            address: address2Checksum,
            chainId: '1',
            ensName: name2,
          },
        },
        2: {
          [name1]: {
            address: address1Checksum,
            chainId: '2',
            ensName: name1,
          },
        },
      },
    });
  });

  it('should clear all ENS entries', () => {
    const controller = new EnsController();
    expect(controller.set('1', name1, address1)).toBe(true);
    expect(controller.set('1', name2, address2)).toBe(true);
    expect(controller.set('2', name1, address1)).toBe(true);
    controller.clear();
    expect(controller.state).toStrictEqual({ ensEntries: {} });
  });
});
