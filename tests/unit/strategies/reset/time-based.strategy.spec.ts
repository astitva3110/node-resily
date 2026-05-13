import { TimeBasedResetStrategy } from '../../../../src/strategies/reset/TimeBasedResetStrategy';

describe('TimeBasedResetStrategy', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects negative cooldowns', () => {
    expect(() => new TimeBasedResetStrategy(-1)).toThrow(RangeError);
  });

  it('accepts zero cooldown for immediate reset evaluation', () => {
    const now = 50_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);

    const s = new TimeBasedResetStrategy(0);
    expect(s.shouldReset(now)).toBe(true);
  });
});
