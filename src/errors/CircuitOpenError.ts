import { ResilyError } from './ResilyError';

/** Rejects when the circuit is open. */
export class CircuitOpenError extends ResilyError {
  public readonly circuitName: string;

  public readonly openedAt: number;

  constructor(circuitName: string, openedAt: number) {
    super(`Circuit "${circuitName}" is open and rejecting calls.`);
    this.circuitName = circuitName;
    this.openedAt = openedAt;
  }
}
