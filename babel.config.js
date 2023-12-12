// We use Babel for our tests in scripts/.
module.exports = {
  env: {
    test: {
      presets: ['@babel/preset-typescript'],
      plugins: ['@babel/plugin-transform-modules-commonjs'],
    },
  },
};
