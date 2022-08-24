import { TokensController } from '../../src/assets/TokensController';

const stubCreateEthers = (ctrl: TokensController, res: boolean) => {
  return jest.spyOn(ctrl, '_createEthersContract').mockImplementation(() => {
    return {
      supportsInterface: jest.fn().mockResolvedValue(res),
    } as any;
  });
};

export default stubCreateEthers;
