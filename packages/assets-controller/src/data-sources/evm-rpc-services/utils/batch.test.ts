import { divideIntoBatches, reduceInBatchesSerially } from './batch';

describe('batch utilities', () => {
  describe('divideIntoBatches', () => {
    it('should divide array into batches of specified size', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = divideIntoBatches(values, { batchSize: 3 });

      expect(result).toStrictEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10]]);
    });

    it('should return single batch when array is smaller than batch size', () => {
      const values = [1, 2, 3];
      const result = divideIntoBatches(values, { batchSize: 10 });

      expect(result).toStrictEqual([[1, 2, 3]]);
    });

    it('should return single batch when array equals batch size', () => {
      const values = [1, 2, 3, 4, 5];
      const result = divideIntoBatches(values, { batchSize: 5 });

      expect(result).toStrictEqual([[1, 2, 3, 4, 5]]);
    });

    it('should return empty array when input is empty', () => {
      const values: number[] = [];
      const result = divideIntoBatches(values, { batchSize: 3 });

      expect(result).toStrictEqual([]);
    });

    it('should handle batch size of 1', () => {
      const values = ['a', 'b', 'c'];
      const result = divideIntoBatches(values, { batchSize: 1 });

      expect(result).toStrictEqual([['a'], ['b'], ['c']]);
    });

    it('should work with objects', () => {
      const values = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const result = divideIntoBatches(values, { batchSize: 2 });

      expect(result).toStrictEqual([[{ id: 1 }, { id: 2 }], [{ id: 3 }]]);
    });

    it('should throw error when batch size is 0', () => {
      const values = [1, 2, 3];

      expect(() => divideIntoBatches(values, { batchSize: 0 })).toThrow(
        'batchSize must be greater than 0',
      );
    });

    it('should throw error when batch size is negative', () => {
      const values = [1, 2, 3];

      expect(() => divideIntoBatches(values, { batchSize: -1 })).toThrow(
        'batchSize must be greater than 0',
      );
    });
  });

  describe('reduceInBatchesSerially', () => {
    it('should reduce array in batches and return accumulated result', async () => {
      const values = [1, 2, 3, 4, 5, 6];
      const result = await reduceInBatchesSerially<number, number[]>({
        values,
        batchSize: 2,
        initialResult: [],
        eachBatch: (workingResult, batch) => {
          const sum = batch.reduce((acc, val) => acc + val, 0);
          return [...(workingResult as number[]), sum];
        },
      });

      // Batches: [1,2]=3, [3,4]=7, [5,6]=11
      expect(result).toStrictEqual([3, 7, 11]);
    });

    it('should handle async eachBatch function', async () => {
      const values = ['a', 'b', 'c', 'd'];
      const result = await reduceInBatchesSerially<string, string>({
        values,
        batchSize: 2,
        initialResult: '',
        eachBatch: async (workingResult, batch) => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          return `${workingResult}${batch.join('')}`;
        },
      });

      expect(result).toBe('abcd');
    });

    it('should pass correct batch index to eachBatch', async () => {
      const values = [1, 2, 3, 4, 5, 6];
      const capturedIndices: number[] = [];

      await reduceInBatchesSerially<number, null>({
        values,
        batchSize: 2,
        initialResult: null,
        eachBatch: (_workingResult, _batch, index) => {
          capturedIndices.push(index);
          return null;
        },
      });

      expect(capturedIndices).toStrictEqual([0, 1, 2]);
    });

    it('should return initial result for empty array', async () => {
      const values: number[] = [];
      const result = await reduceInBatchesSerially<number, number[]>({
        values,
        batchSize: 2,
        initialResult: [42],
        eachBatch: (workingResult, batch) => {
          return [...(workingResult as number[]), ...batch];
        },
      });

      expect(result).toStrictEqual([42]);
    });

    it('should process batches serially, not in parallel', async () => {
      const values = [1, 2, 3, 4];
      const executionOrder: number[] = [];

      await reduceInBatchesSerially<number, null>({
        values,
        batchSize: 2,
        initialResult: null,
        eachBatch: async (_workingResult, _, index) => {
          // Simulate varying async delays
          const delay = index === 0 ? 20 : 5;
          await new Promise((resolve) => setTimeout(resolve, delay));
          executionOrder.push(index);
          return null;
        },
      });

      // Despite first batch taking longer, they should execute in order
      expect(executionOrder).toStrictEqual([0, 1]);
    });

    it('should accumulate results correctly across batches', async () => {
      type ResultType = { count: number; items: string[] };
      const values = ['apple', 'banana', 'cherry', 'date'];

      const result = await reduceInBatchesSerially<string, ResultType>({
        values,
        batchSize: 2,
        initialResult: { count: 0, items: [] },
        eachBatch: (workingResult, batch) => {
          const current = workingResult as ResultType;
          return {
            count: current.count + batch.length,
            items: [...current.items, ...batch],
          };
        },
      });

      expect(result).toStrictEqual({
        count: 4,
        items: ['apple', 'banana', 'cherry', 'date'],
      });
    });

    it('should handle single element batches', async () => {
      const values = [10, 20, 30];
      const result = await reduceInBatchesSerially<number, number>({
        values,
        batchSize: 1,
        initialResult: 0,
        eachBatch: (workingResult, batch) => {
          return workingResult + batch[0];
        },
      });

      expect(result).toBe(60);
    });

    it('should handle batch size larger than array', async () => {
      const values = [1, 2, 3];
      const batchCount: number[] = [];

      const result = await reduceInBatchesSerially<number, number>({
        values,
        batchSize: 100,
        initialResult: 0,
        eachBatch: (workingResult, batch) => {
          batchCount.push(batch.length);
          return workingResult + batch.reduce((a, b) => a + b, 0);
        },
      });

      expect(result).toBe(6);
      expect(batchCount).toStrictEqual([3]); // Only one batch with all 3 elements
    });
  });
});
