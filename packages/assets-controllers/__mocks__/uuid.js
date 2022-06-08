const uuid = require('uuid');

// mock the v4 function of uuid lib to make sure it returns the fixed id for testing
const v4 = () => '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

module.exports.NIL = uuid.NIL;
module.exports.v1 = uuid.v1;
module.exports.v3 = uuid.v3;
module.exports.v5 = uuid.v5;
module.exports.parse = uuid.parse;
module.exports.validate = uuid.validate;
module.exports.stringify = uuid.stringify;

module.exports.v4 = v4;
