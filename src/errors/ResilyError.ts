/**
 * Base error class for all errors thrown by the resily library.
 * Extends the native `Error` so callers can use `instanceof ResilyError`.
 */
export class ResilyError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = this.constructor.name;
    // Maintain proper prototype chain in transpiled ES5 output.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
