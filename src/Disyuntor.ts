import { EventEmitter } from 'events'
import ms from 'ms'

import { Options } from './Options';
import { DisyuntorError } from './DisyuntorError';
import { create as createTimeout } from './Timeout';
import {addListener} from "cluster";
import {DisyuntorConfig} from "./Config";

const defaults = {
  timeout:     '2s',
  maxFailures: 5,
  cooldown:    '15s',
  maxCooldown: '30s',
  trigger:     () => true
};

enum State {
  Closed = "closed",
  Open = "open",
  HalfOpen = "half open",
}

// TODO cleaner type definition + document
type PromiseBuilder<T> = (...args: any[]) => Promise<T>;

export class Disyuntor extends EventEmitter {
  private config: DisyuntorConfig;

  failures: number = 0;
  lastFailure: number = 0;
  currentCooldown: number;

  public get timeout(): number {
    return this.config.thresholdConfig.callTimeoutMs;
  }

  constructor(params: Options.Parameters){
    super()
    this.config = DisyuntorConfig.fromParameters(params);
    // TODO this is redundant, but necessary for typing.  De-dup
    this.currentCooldown = this.config.thresholdConfig.minCooldownTimeMs;
    this.reset();

    // TODO move this validation + setup elsewhere
    if (typeof this.config.onBreakerTripEvent === 'function') {
      this.on('trip', this.config.onBreakerTripEvent);
    }

    // TODO move this validation + setup elsewhere
    if (typeof this.config.onBreakerCloseEvent === 'function') {
      this.on('close', this.config.onBreakerCloseEvent);
    }
  }

  reset() {
    this.failures = 0;
    this.lastFailure = 0;
    this.currentCooldown = this.config.thresholdConfig.minCooldownTimeMs;
  }

  get state(): State {
    // TODO sliding window?  Error rate?  more failure recognition algorithms
    if (this.failures >= this.config.thresholdConfig.maxConsecutiveFailures) {
      const timeSinceLastFailure = Date.now() - this.lastFailure;
      // check to see if this failure has occurred within the cooldown period
      if (timeSinceLastFailure < this.currentCooldown) {
        return State.Open;
      } else {
        return State.HalfOpen;
      }
    } else  {
      return State.Closed;
    }
  }

  async protect<A, T extends PromiseBuilder<A>>(call: T): Promise<A> {
    const state = this.state;
    const cooldown = this.currentCooldown;

    if(state === State.Open) {
      throw new DisyuntorError(
          `${this.config.name}: the circuit-breaker is open`,
          this.state
      );
    } else if (state === State.HalfOpen) {
      this.currentCooldown = Math.min(
          this.currentCooldown * (this.failures + 1),
          this.config.thresholdConfig.maxCooldownTimeMs
      );
    }

    try {
      const promise = call();
      let result: A;

      if (!this.config.thresholdConfig.enforceCallTimeout) {
        result = await promise;
      } else {
        const timeout = createTimeout<A>(
          this.config.name,
          this.config.thresholdConfig.callTimeoutMs,
          promise);

        result = await Promise.race([ timeout,  promise ]);
      }


      if (state === State.HalfOpen) {
        this.emit('close', cooldown);
      }

      //If it worked we need to reset it, regardless if is half-open or closed,
      //the failures counter is meant to accumulate failures in a row.
      this.reset();

      return result;
    } catch(err) {
      if (this.config.shouldTriggerAsFailure(err)) {
        this.failures++;
        this.lastFailure = Date.now();
        if (this.failures >= this.config.thresholdConfig.maxConsecutiveFailures) {
          this.emit('trip',
            err,
            this.failures,
            this.currentCooldown
          );
        }
      }
      throw err;
    }
  }
}

export function wrapCallbackApi<T extends (...args: any[]) => void>(
  params: Options.Parameters,
  call: T,
  thisParam?: any
) : T {
  const disyuntor = new Disyuntor(params);
  return <T>function(...args) {
    const callback : (...args: any[]) => void = args[args.length - 1];
    disyuntor.protect(() => {
      return new Promise((resolve, reject) => {
        const newArgs = args.slice(0, -1)
          .concat((err: Error | null, ...cbArgs: any[]) => {
            if (err) { return reject(err); }
            resolve(cbArgs);
          });
        call.call(thisParam, ...newArgs)
      });
    }).then(
      (args) => {
        if (Array.isArray(args)) {
          callback(null, ...args);
        } else {
          callback(null, args);
        }
      },
      err => {
        callback(err);
      }
    );
  };
}

export function wrapPromise<A, T extends PromiseBuilder<A>>(
  params: Options.Parameters,
  call: T
) {
  if (typeof call !== 'function') {
    throw new Error(`expecting a function returning a promise but got ${{}.toString.call(call)}`);
  }
  const disyuntor = new Disyuntor(params);
  return function(...args: any[]): Promise<{} | A> {
    return disyuntor.protect(async () => {
      const promise = call(...args);
      if (!promise || !promise.then) {
        throw new Error(`expecting a promise but got ${{}.toString.call(promise)}`);
      }
      // TODO is this redundant?
      return await promise;
    });
  }
}

export { DisyuntorError, Options };
