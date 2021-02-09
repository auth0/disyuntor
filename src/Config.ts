import {Options} from "./Options";
import ms from "ms";

/**
 * Internal representation of the various thresholds (time/count) for the circuit breaker algorithm
 */
export class ThresholdsConfig {
  readonly enforceCallTimeout: boolean;
  readonly callTimeoutMs: number;
  // TODO this assumes a single backoff algo.  Future improvement: define backoff algo seperately
  readonly maxConsecutiveFailures: number;
  readonly minCooldownTimeMs: number;
  readonly maxCooldownTimeMs: number;

  constructor(
      enforceCallTimeout: boolean = true,
      callTimeoutMs: number = 2000,
      maxConsecutiveFailures: number = 5,
      minCooldownTimeMs: number = 15000,
      maxCooldownTimeMs: number = 30000
  ) {
      this.enforceCallTimeout = enforceCallTimeout;
      this.callTimeoutMs = callTimeoutMs;
      this.maxConsecutiveFailures = maxConsecutiveFailures;
      this.minCooldownTimeMs = minCooldownTimeMs;
      this.maxCooldownTimeMs = maxCooldownTimeMs;
  }
}

/**
 * Internal representation of Disyuntor configuration.  Responsible for taking user input (Options.Parameters), sanitizing,
 * and providing reasonable defaults that can be used in a type-safe way.
 *
 * Reasoning:
 *  - Assigning defaults with Object.assign provides no reliable (enforced) type safety
 *  - Iterating through parameters represented in a variety of ways and changing them on-the-fly implies highly imperative (also unreliable) object state
 *  - Some externally-facing input parameters are used to signal a numeric value OR turn something off (timeout)
 *  - External input representation cannot be easily changed, will likely need to walk through external deprecation process
 */
export class DisyuntorConfig {

    /**
     * Convenience method for mixed-bag time objects
     *
     * @param input represents a time unit.  If a number, it's milliseconds.  If a string, it's assumed to be
     * be something the ms library can parse (i.e. '5s').
     * @param defaultValue value to use if it's not a number or string that can be parsed by ms lib
     * @return number of milliseconds, or default if none provided/parsable
     */
    private static getMilliseconds(input: number | string | boolean | undefined, defaultValue: number): number {
        if(typeof input === 'number') {
            return input;
        } else if (typeof input === 'string') {
            return ms(input);
        } else {
            return defaultValue;
        }
    }

    public static fromParameters(parameters: Options.Parameters): DisyuntorConfig{
        if (typeof parameters.name === 'undefined') {
            throw new Error('params.name is required');
        }

        // TODO centralize defaults and use here
        let enforceCallTimeout: boolean = true;
        if (parameters.timeout === true) {
            throw new Error('invalid timeout parameter. It should be either a timespan or false.');
        } else if (parameters.timeout === false) {
            enforceCallTimeout = false;
        }

        // TODO centralize defaults and use here
        const thresholdConfig = new ThresholdsConfig(
            enforceCallTimeout,
            this.getMilliseconds(parameters.timeout, 2000),
            parameters.maxFailures,
            this.getMilliseconds(parameters.cooldown, 15000),
            this.getMilliseconds(parameters.maxCooldown, 30000)
        );
        return new DisyuntorConfig(parameters.name, thresholdConfig, parameters.onTrip, parameters.onClose, parameters.trigger);
    }

    readonly name;
    readonly thresholdConfig;
    readonly onBreakerTripEvent?: (err: Error, failures: number, currentCooldown: number) => any;
    readonly onBreakerCloseEvent?: (currentCooldown: number) => any;
    readonly shouldTriggerAsFailure: (err: Error) => boolean;

    constructor(name: string,
                thresholdConfig: ThresholdsConfig,
                onBreakerTripEvent?: (err: Error, failures: number, currentCooldown: number) => any,
                onBreakerCloseEvent?: (currentCooldown: number) => any,
                shouldTriggerAsFailure: (err: Error) => boolean = () => true) {
        this.name = name;
        this.thresholdConfig = thresholdConfig;
        this.onBreakerTripEvent = onBreakerTripEvent;
        this.onBreakerCloseEvent = onBreakerCloseEvent;
        this.shouldTriggerAsFailure = shouldTriggerAsFailure;
    }
}
