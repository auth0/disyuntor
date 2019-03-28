import { EventEmitter } from 'events'
import ms from 'ms'

import { Options } from './Options';
import { DisyuntorError } from './DisyuntorError';
import { create as createTimeout } from './Timeout';
import { getHeapStatistics } from 'v8';

const defaults = {
  timeout:     '2s',
  maxFailures: 5,
  cooldown:    '15s',
  maxCooldown: '30s',
  trigger:     () => true
};

const timeProps = ['timeout', 'cooldown', 'maxCooldown'];

enum State {
  Closed = "closed",
  Open = "open",
  HalfOpen = "half open",
}

type PromiseBuilder<T> = (...args: any[]) => Promise<T>;

export class Disyuntor extends EventEmitter {
  private params: Options.Parameters;

  failures: number = 0;
  lastFailure: number = 0;
  currentCooldown?: number;

  public get timeout(): number {
    //this is already parsed
    return <number>this.params.timeout;
  }

  constructor(params: Options.Parameters){
    super()
    this.params = Object.assign({}, defaults, params);

    if (typeof this.params.name === 'undefined') {
      throw new Error('params.name is required');
    }

    if (this.params.timeout === true) {
      throw new Error('invalid timeout parameter. It should be either a timespan or false.');
    }

    timeProps.forEach(k => {
      var v = this.params[k];
      if (typeof v === 'string') {
        this.params[k] = ms(v);
      }
    });

    this.reset();

    if (typeof this.params.onTrip === 'function') {
      this.on('trip', this.params.onTrip);
    }

    if (typeof this.params.onClose === 'function') {
      this.on('close', this.params.onClose);
    }
  }

  reset() {
    this.failures = 0;
    this.lastFailure = 0;
    this.currentCooldown = <number>this.params.cooldown;
  }


  get state(): State {
    if (this.failures >= this.params.maxFailures) {
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
          `${this.params.name}: the circuit-breaker is open`,
          this.state
      );
    } else if (state === State.HalfOpen) {
      this.currentCooldown = Math.min(
          this.currentCooldown * (this.failures + 1),
          <number>this.params.maxCooldown
      );
    }

    try {
      const promise = call();
      let result: A;

      if (this.params.timeout === false) {
        result = await promise;
      } else {
        const timeout = createTimeout<A>(
          this.params.name,
          <number>this.params.timeout,
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
      if (this.params.trigger(err)) {
        this.failures++;
        this.lastFailure = Date.now();
        if (this.failures >= this.params.maxFailures) {
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
          .concat((err?: Error, ...args: any[]) => {
            if (err) { return reject(err); }
            resolve(...args);
          });
        call.call(thisParam, ...newArgs)
      });
    }).then(
      (...args) => {
        callback(null, ...args)
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
      var promise = call(...args);
      if (!promise || !promise.then) {
        throw new Error(`expecting a promise but got ${{}.toString.call(promise)}`);
      }
      return await promise;
    });
  }
}

export { DisyuntorError, Options };
