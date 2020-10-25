const {
  TokenRatesController,
} = require('./dist');

const assets = new TokenRatesController({
  disabled: false,
  interval: 1000,
  nativeCurrency: 'usd',
  tokens: [
    { address: '0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359' },
    { address: '0x960b236A07cf122663c4303350609A66A7B288C0' },
    { address: '0xB8c77482e45F1F44dE1745F52C74426C631bDD52' },
    { address: '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2' },
  ],
});

assets.subscribe(console.log);
