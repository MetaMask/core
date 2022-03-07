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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fetchBlockFeeHistory_1 = __importDefault(require("../fetchBlockFeeHistory"));
class BlockFeeHistoryDatasetFetcher {
    constructor({ ethQuery, endBlockNumber, }) {
        this.ethQuery = ethQuery;
        this.endBlockNumber = endBlockNumber;
    }
    forAll() {
        return __awaiter(this, void 0, void 0, function* () {
            const [mediumRange, smallRange, tinyRange, latestWithNextBlock,] = yield Promise.all([
                this.forMediumRange(),
                this.forSmallRange(),
                this.forTinyRange(),
                this.forLatestWithNextBlock(),
            ]);
            const latest = latestWithNextBlock.slice(0, -1);
            return {
                mediumRange,
                smallRange,
                tinyRange,
                latest,
                latestWithNextBlock,
            };
        });
    }
    forMediumRange() {
        return this.fetchExcludingNextBlock({
            numberOfBlocks: 200,
            percentiles: [10, 95],
        });
    }
    forSmallRange() {
        return this.fetchExcludingNextBlock({
            numberOfBlocks: 5,
            percentiles: [10, 20, 30],
        });
    }
    forTinyRange() {
        return this.fetchExcludingNextBlock({
            numberOfBlocks: 2,
            percentiles: [50],
        });
    }
    forLatestWithNextBlock() {
        return this.fetchIncludingNextBlock({
            numberOfBlocks: 1,
            percentiles: [10, 95],
        });
    }
    fetchExcludingNextBlock(args) {
        return fetchBlockFeeHistory_1.default(Object.assign({ ethQuery: this.ethQuery, endBlock: this.endBlockNumber }, args));
    }
    fetchIncludingNextBlock(args) {
        return fetchBlockFeeHistory_1.default(Object.assign({ ethQuery: this.ethQuery, endBlock: this.endBlockNumber, includeNextBlock: true }, args));
    }
}
exports.default = BlockFeeHistoryDatasetFetcher;
//# sourceMappingURL=BlockFeeHistoryDatasetFetcher.js.map