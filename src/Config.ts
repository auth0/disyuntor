import {Options} from "./Options";

/**
 * Internal representation of the various thresholds (time/count) for the circuit breaker algorithm
 */
export class ThresholdsConfig {
  private readonly enforceCallTimeout: boolean;
  private readonly callTimeoutMs: number;
  private readonly maxConsecutiveFailures: number;
  private readonly minCooldownTimeMs: number;
  private readonly maxCooldownTimeMs: number;

  constructor(
      // NOTE: there is external-facing documentation in Options.ts that enumerates "defaults".  Keep it in sync with this.
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

    public static fromParameters(parameters: Options.Parameters): DisyuntorConfig{
        const thresholdsConfig = new ThresholdsConfig();
        return new DisyuntorConfig(parameters.name, thresholdsConfig);
    }

    constructor(name: string, thresholdConfig: ThresholdsConfig, ) {

    }
}
