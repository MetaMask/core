import { BN } from 'ethereumjs-util';
import { mocked } from 'ts-jest/utils';
import determineNetworkStatusInfo from './determineNetworkStatusInfo';
import fetchBusyThreshold from './fetchBusyThreshold';
import calculateBusyThreshold from './calculateBusyThreshold';

jest.mock('./fetchBusyThreshold');
jest.mock('./calculateBusyThreshold');

const mockedFetchBusyThreshold = mocked(fetchBusyThreshold, true);
const mockedCalculateBusyThreshold = mocked(calculateBusyThreshold, true);

describe('determineNetworkStatusInfo', () => {
  const defaultOptions = {
    url: 'http://some.endpoint',
    ethQuery: {},
    clientId: '1',
  };

  describe('assuming that fetchBusyThreshold does not fail', () => {
    beforeEach(() => {
      mockedFetchBusyThreshold.mockResolvedValue(new BN(1_000_000_000));
    });

    it('returns an object with isNetworkBusy: true if the given base fee matches the fetched busy threshold', async () => {
      const networkStatusInfo = await determineNetworkStatusInfo({
        ...defaultOptions,
        latestBaseFee: new BN(1_000_000_000),
      });

      expect(networkStatusInfo).toStrictEqual({
        isNetworkBusy: true,
      });
    });

    it('returns an object with isNetworkBusy: true if the given base fee is greater than the fetched busy threshold', async () => {
      const networkStatusInfo = await determineNetworkStatusInfo({
        ...defaultOptions,
        latestBaseFee: new BN(1_000_000_001),
      });

      expect(networkStatusInfo).toStrictEqual({
        isNetworkBusy: true,
      });
    });

    it('returns an object with isNetworkBusy: false if the given base fee is less than the fetched busy threshold', async () => {
      const networkStatusInfo = await determineNetworkStatusInfo({
        ...defaultOptions,
        latestBaseFee: new BN(999_999_999),
      });

      expect(networkStatusInfo).toStrictEqual({
        isNetworkBusy: false,
      });
    });
  });

  describe('if fetchBusyThreshold fails', () => {
    beforeEach(() => {
      mockedFetchBusyThreshold.mockRejectedValue(new Error('uh oh'));

      mockedCalculateBusyThreshold.mockResolvedValue(new BN(1_000_000_000));
    });

    it('returns an object with isNetworkBusy: true if the given base fee matches the fetched busy threshold', async () => {
      const networkStatusInfo = await determineNetworkStatusInfo({
        ...defaultOptions,
        latestBaseFee: new BN(1_000_000_000),
      });

      expect(networkStatusInfo).toStrictEqual({
        isNetworkBusy: true,
      });
    });

    it('returns an object with isNetworkBusy: true if the given base fee is greater than the fetched busy threshold', async () => {
      const networkStatusInfo = await determineNetworkStatusInfo({
        ...defaultOptions,
        latestBaseFee: new BN(1_000_000_001),
      });

      expect(networkStatusInfo).toStrictEqual({
        isNetworkBusy: true,
      });
    });

    it('returns an object with isNetworkBusy: false if the given base fee is less than the fetched busy threshold', async () => {
      const networkStatusInfo = await determineNetworkStatusInfo({
        ...defaultOptions,
        latestBaseFee: new BN(999_999_999),
      });

      expect(networkStatusInfo).toStrictEqual({
        isNetworkBusy: false,
      });
    });
  });
});
