import { EventEmitter } from 'events'
import ms from 'ms'

import { Options } from './Options';
import { DisyuntorError } from './DisyuntorError';
import { create as createTimeout } from './Timeout';

const defaults = {
  timeout:     '2s',
  maxFailures: 5,
  cooldown:    '15s',
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

  constructor(params: Options.Parameters){
    super()
    this.params = Object.assign({}, defaults, params);
    if (typeof this.params.name === 'undefined') {
      throw new Error('params.name is required');
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
  }

  reset() {
    this.failures = 0;
    this.lastFailure = 0;
    this.currentCooldown = <number>this.params.cooldown;
  }

  get state(): State {
    if (this.failures >= this.params.maxFailures) {
      if ((Date.now() - this.lastFailure) < this.currentCooldown) {
        return State.Open;
      } else {
        return State.HalfOpen;
      }
    } else  {
      return State.Closed;
    }
  }

  async protect<A, T extends PromiseBuilder<A>>(call: T): Promise<A> {
    if(this.state === State.Open) {
      throw new DisyuntorError(`${this.params.name}: the circuit-breaker is open`, this.state);
    } else if (this.state === State.HalfOpen) {
      this.currentCooldown = Math.min(this.currentCooldown * (this.failures + 1), <number>this.params.maxCooldown);
    }

    const timeout = createTimeout<A>(
        this.params.name,
        <number>this.params.timeout);

    try {
      const prom = Promise.race([ timeout, call() ]);
      return await prom;
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
    } finally {
      timeout.cancel();
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

export { DisyuntorError };
