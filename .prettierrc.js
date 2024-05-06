/**
 * @type {import('prettier').Options}
 */
module.exports = {
  plugins: ['prettier-plugin-packagejson'],
  // All of these are defaults except singleQuote, but we specify them
  // for explicitness
  quoteProps: 'as-needed',
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'all',
};
