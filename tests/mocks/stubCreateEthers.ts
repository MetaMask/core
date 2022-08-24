import { TokensController } from '../../src/assets/TokensController';
import sinon from 'sinon';

const stubCreateEthers = (ctrl: TokensController, res: boolean) => {
  return sinon.stub(ctrl, '_createEthersContract')
    .callsFake(() => {
      return {
        supportsInterface: sinon.stub().returns(res),
      } as any;
    });
};

export default stubCreateEthers;
