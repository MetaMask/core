const Controller = require('./dist/CurrencyRateController.js').default;

const c = new Controller({ interval: 1337 });

console.log(c.state, c.config);

