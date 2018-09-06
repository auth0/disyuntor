/**
 * Wraps an asynchronous function with disyuntor.
 * @param protected The function we want to protect.
 * @param params The parameters for the circuit-breaker.
 */
declare function wrap<T>(
  protected: T,
  params: wrap.Parameters
): T;

declare namespace wrap {
  export interface Parameters {
    /**
     * The name of the function or resource used in error messages.
     */
    name: string,

    /**
     * Timeout for the protected functions in milliseconds or ms timespan format.
     * Defaults to "2s".
     */
    timeout?: number|string;

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
    cooldown?: number|string;

    /**
     * The maximum time the circuit remains open before doing a new attempt.
     * Defaults to 60s
     */
    maxCooldown?: number|string;

    /**
     * Callback executed every time the circuit-breaker trips.
     * @param err The last error that trigger the change from closed to open.
     * @param failures The number of failures before triggering.
     * @param currentCooldown The amount of milliseconds before switching to half-open.
     */
    onTrip?(err: Error, failures: number, currentCooldown: number): any;

    /**
     * Callback executed to verify if an error should trigger the circuit-breaker logic.
     * @param {Error} err the error to verify.
     * @returns {Boolean} false if we want to skip the error
     */
    trigger?(err: Error): boolean;
  }

  type PromiseCreator<T> = (...args: any[]) => Promise<T>;

  /**
   * Wraps a promise-creation function with circuit-breaker logic.
   * @param create The promise-creation function we want to protect.
   * @param params The parameters for the circuit-breaker.
   */
  export function promise<A, T extends PromiseCreator<A>>(
    create: T,
    params: Parameters
  ): T;
}



export default wrap;
