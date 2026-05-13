import { ResilyError } from './ResilyError';

/**
 * Thrown when a call is attempted while the circuit breaker is in the open state.
 */
export class CircuitOpenError extends ResilyError {
  /** Name of the circuit that is currently open. */
  public readonly circuitName: string;

  /** Timestamp (ms since epoch) when the circuit opened. */
  public readonly openedAt: number;

  constructor(circuitName: string, openedAt: number) {
    super(`Circuit "${circuitName}" is open and rejecting calls.`);
    this.circuitName = circuitName;
    this.openedAt = openedAt;
  }
}
