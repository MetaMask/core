import type { TVShapeId } from '../../../core/types.js';
import {
  getPositionShapeIds,
  pushPositionShapeId,
  clearPositionShapeIds,
  bumpGeneration,
  getGeneration,
  _resetPositionLineStateForTests,
} from '../state.js';

describe('positionLines/state', () => {
  beforeEach(() => {
    _resetPositionLineStateForTests();
  });

  it('starts empty', () => {
    expect(getPositionShapeIds()).toStrictEqual([]);
  });

  it('pushPositionShapeId appends IDs', () => {
    pushPositionShapeId('shape-1' as TVShapeId);
    pushPositionShapeId('shape-2' as TVShapeId);
    expect(getPositionShapeIds()).toStrictEqual(['shape-1', 'shape-2']);
  });

  it('clearPositionShapeIds empties the list', () => {
    pushPositionShapeId('shape-1' as TVShapeId);
    pushPositionShapeId('shape-2' as TVShapeId);
    clearPositionShapeIds();
    expect(getPositionShapeIds()).toStrictEqual([]);
  });

  it('_resetPositionLineStateForTests resets to empty', () => {
    pushPositionShapeId('shape-1' as TVShapeId);
    _resetPositionLineStateForTests();
    expect(getPositionShapeIds()).toStrictEqual([]);
  });

  it('bumpGeneration increments and returns the new value', () => {
    expect(bumpGeneration()).toBe(1);
    expect(bumpGeneration()).toBe(2);
    expect(getGeneration()).toBe(2);
  });

  it('_resetPositionLineStateForTests resets generation to 0', () => {
    bumpGeneration();
    _resetPositionLineStateForTests();
    expect(getGeneration()).toBe(0);
  });
});
