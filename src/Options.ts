export namespace Options {
  export interface Parameters {
    /**
     * The name of the function or resource used in error messages.
     */
    name: string;

    /**
     * Timeout for the protected functions in milliseconds or ms timespan format.
     * Defaults to "2s".
     */
    timeout?: number | string | boolean;

    /**
     * The number of consecutive failures before switching to open mode and stop
     * calling the underlying service.
     * Defaults to 5
     */
    maxFailures?: number;

    /**
     * The minimum time the circuit remains open before doing a new attempt.
     * Defaults to 15s
     */
    cooldown?: number | string;

    /**
     * The maximum time the circuit remains open before doing a new attempt.
     * Defaults to 60s
     */
    maxCooldown?: number | string;

    /**
     * Callback executed every time the circuit-breaker trips.
     * @param err The last error that trigger the change from closed to open.
     * @param failures The number of failures before triggering.
     * @param currentCooldown The amount of milliseconds before switching to half-open.
     */
    onTrip?(err: Error, failures: number, currentCooldown: number): any;

    /**
     * Callback executed every time the circuit-breaker closes after half-open state.
     * @param currentCooldown The amount of milliseconds before closing back.
     */
    onClose?(currentCooldown: number): any;

    /**
     * Callback executed to verify if an error should trigger the circuit-breaker logic.
     * @param {Error} err the error to verify.
     * @returns {Boolean} false if we want to skip the error
     */
    trigger?(err: Error): boolean;

    [key: string]: string | Function | number | boolean;
  }
}
