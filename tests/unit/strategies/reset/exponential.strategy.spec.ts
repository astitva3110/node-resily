import { ExponentialResetStrategy } from '../../../../src/strategies/reset/exponential.strategy';

describe('ExponentialResetStrategy', () => {
  it('rejects inconsistent configuration', () => {
    expect(
      () =>
        new ExponentialResetStrategy({
          initialDelayMs: -10,
          multiplier: 2,
          maxDelayMs: 60_000,
        }),
    ).toThrow(RangeError);

    expect(
      () =>
        new ExponentialResetStrategy({
          initialDelayMs: 100,
          multiplier: 0.5,
          maxDelayMs: 60_000,
        }),
    ).toThrow(RangeError);

    expect(
      () =>
        new ExponentialResetStrategy({
          initialDelayMs: 200,
          multiplier: 2,
          maxDelayMs: 100,
        }),
    ).toThrow(RangeError);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('starts at initialDelayMs', () => {
    const openedAt = 1_705_000_000_000;
    const s = new ExponentialResetStrategy({
      initialDelayMs: 1000,
      multiplier: 2,
      maxDelayMs: 60_000,
    });

    let now = openedAt;
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    expect(s.shouldReset(openedAt, { lastBreakingFailureAt: openedAt })).toBe(false);

    now = openedAt + 1000;
    expect(s.shouldReset(openedAt, { lastBreakingFailureAt: openedAt })).toBe(true);
  });

  it('multiplies cooldown after onBreakingFailure and caps at maxDelayMs', () => {
    const openedAt = 1000;
    const s = new ExponentialResetStrategy({
      initialDelayMs: 1000,
      multiplier: 2,
      maxDelayMs: 3500,
    });

    let now = openedAt;
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    now = openedAt + 1000;
    expect(s.shouldReset(openedAt, { lastBreakingFailureAt: openedAt })).toBe(true);

    const failA = openedAt + 2000;
    now = failA;
    s.onBreakingFailure?.();

    now = failA + 1999;
    expect(s.shouldReset(openedAt, { lastBreakingFailureAt: failA })).toBe(false);
    now = failA + 2000;
    expect(s.shouldReset(openedAt, { lastBreakingFailureAt: failA })).toBe(true);

    const failB = failA + 10_000;
    now = failB;
    s.onBreakingFailure?.();

    now = failB + 3499;
    expect(s.shouldReset(openedAt, { lastBreakingFailureAt: failB })).toBe(false);
    now = failB + 3500;
    expect(s.shouldReset(openedAt, { lastBreakingFailureAt: failB })).toBe(true);

    const failC = failB + 7000;
    now = failC;
    s.onBreakingFailure?.();

    now = failC + 3499;
    expect(s.shouldReset(openedAt, { lastBreakingFailureAt: failC })).toBe(false);
    now = failC + 3500;
    expect(s.shouldReset(openedAt, { lastBreakingFailureAt: failC })).toBe(true);
  });

  it('onCircuitRecovered resets delay to initial', () => {
    const openedAt = 10_000;
    const s = new ExponentialResetStrategy({
      initialDelayMs: 100,
      multiplier: 10,
      maxDelayMs: 60_000,
    });

    let now = openedAt;
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    now = openedAt + 100;
    expect(s.shouldReset(openedAt, { lastBreakingFailureAt: openedAt })).toBe(true);

    s.onBreakingFailure?.();

    const later = openedAt + 50_000;
    now = later;
    expect(s.shouldReset(openedAt, { lastBreakingFailureAt: later })).toBe(false);

    now = later + 1000;
    expect(s.shouldReset(openedAt, { lastBreakingFailureAt: later })).toBe(true);

    s.onCircuitRecovered?.();

    const recovered = later + 9999;
    now = recovered + 50;
    expect(s.shouldReset(openedAt, { lastBreakingFailureAt: recovered })).toBe(false);

    now = recovered + 100;
    expect(s.shouldReset(openedAt, { lastBreakingFailureAt: recovered })).toBe(true);
  });

  it('shouldReset returns false while below required delay and true once elapsed', () => {
    const anchor = 200_000;
    const s = new ExponentialResetStrategy({
      initialDelayMs: 500,
      multiplier: 2,
      maxDelayMs: 60_000,
    });

    let now = anchor;
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    now = anchor + 400;
    expect(s.shouldReset(anchor, { lastBreakingFailureAt: anchor })).toBe(false);

    now = anchor + 500;
    expect(s.shouldReset(anchor, { lastBreakingFailureAt: anchor })).toBe(true);
  });
});
