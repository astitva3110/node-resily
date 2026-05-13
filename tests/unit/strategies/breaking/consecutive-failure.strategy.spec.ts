import { ConsecutiveFailureBreakingStrategy } from '../../../../src/strategies/breaking/ConsecutiveFailureBreakingStrategy';

describe('ConsecutiveFailureBreakingStrategy', () => {
  it('rejects non-positive thresholds', () => {
    expect(() => new ConsecutiveFailureBreakingStrategy(0)).toThrow(RangeError);
    expect(() => new ConsecutiveFailureBreakingStrategy(-1)).toThrow(RangeError);
  });
});
