export class DisyuntorError extends Error {
  constructor(
    public message: string,
    public reason: string) {
    super(message);
    Object.setPrototypeOf(this, DisyuntorError.prototype);
    Error.captureStackTrace(this, this.constructor)
  }
}
