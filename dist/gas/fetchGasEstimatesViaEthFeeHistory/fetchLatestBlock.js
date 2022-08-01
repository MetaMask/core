"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("../../util");
/**
 * Returns information about the latest completed block.
 *
 * @param ethQuery - An EthQuery instance
 * @param includeFullTransactionData - Whether or not to include all data for transactions as
 * opposed to merely hashes. False by default.
 * @returns The block.
 */
function fetchLatestBlock(ethQuery, includeFullTransactionData = false) {
    return __awaiter(this, void 0, void 0, function* () {
        const blockNumber = yield (0, util_1.query)(ethQuery, 'blockNumber');
        const block = yield (0, util_1.query)(ethQuery, 'getBlockByNumber', [
            blockNumber,
            includeFullTransactionData,
        ]);
        return Object.assign(Object.assign({}, block), { number: (0, util_1.fromHex)(block.number), baseFeePerGas: (0, util_1.fromHex)(block.baseFeePerGas) });
    });
}
exports.default = fetchLatestBlock;
//# sourceMappingURL=fetchLatestBlock.js.map