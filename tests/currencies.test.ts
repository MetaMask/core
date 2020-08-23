import currencies from '../src/currencies';

const toCheck = [
  "eur",
  "etc",
  "usd",
  "sai"
];

describe('Test for some currencies', () => {
  it('should have the important ones', () => {
    toCheck.forEach(value => {
      expect(currencies.some(currency => currency.code === value))
    })
	});
})
