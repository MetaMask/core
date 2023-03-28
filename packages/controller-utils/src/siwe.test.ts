import { ParsedMessage } from '@spruceid/siwe-parser';
import { detectSIWE } from './siwe';

const mockedParsedMessage = {
  domain: 'example.eth',
  address: '0x0000000',
};

jest.mock('@spruceid/siwe-parser');

describe('detectSIWE', () => {
  const parsedMessageMock = ParsedMessage as any;
  it('returns an object with isSIWEMessage set to true and parsedMessage', () => {
    parsedMessageMock.mockReturnValue(mockedParsedMessage);
    const result = detectSIWE({ data: '0xVALIDDATA' });
    expect(result.isSIWEMessage).toBe(true);
    expect(result.parsedMessage).toBe(mockedParsedMessage);
  });

  it('returns an object with isSIWEMessage set to false and parsedMessage set to null', () => {
    parsedMessageMock.mockImplementation(() => {
      throw new Error('Invalid SIWE message');
    });
    const result = detectSIWE({ data: '0xINVALIDDATA' });
    expect(result.isSIWEMessage).toBe(false);
    expect(result.parsedMessage).toBeNull();
  });
});
