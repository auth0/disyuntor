const ms              = require('ms');
const Promise         = require('bluebird');
const fargs           = require('very-fast-args');

const DisyuntorError  = require('./lib/DisyuntorError');
const timeProps       = ['timeout', 'cooldown', 'maxCooldown'];
const states          = ['closed', 'open', 'half open'];

const defaults = {
  timeout:     '2s',
  maxFailures: 5,
  cooldown:    '15s',
  onTrip:      () => {},
  trigger:     () => true
};

function wrapper (protected, params) {
  const config = Object.assign({}, defaults, params);

  if (!config.name) {
    throw new Error('params.name is required');
  }

  //convert properties to milliseconds.
  timeProps.forEach(p => {
    config[p] = typeof config[p] === 'string' ? ms(config[p]) : config[p];
  });

  if (!config.maxCooldown) {
    config.maxCooldown = config.cooldown * 3;
  }

  var failures, lastFailure, currentCooldown;

  function getState() {
    if (failures >= config.maxFailures) {
      if ((Date.now() - lastFailure) < currentCooldown) {
        return states[1];
      } else {
        return states[2];
      }
    } else  {
      return states[0];
    }
  }

  function reset() {
    failures = 0;
    lastFailure = 0;
    currentCooldown = config.cooldown;
  }

  reset();

  function protector() {
    const args =  fargs.apply(null, arguments);

    const originalCallback = args[args.length - 1];

    let timedOut = false;

    const currentState = getState();

    if (currentState === states[1]) {
      const err = new DisyuntorError(config.name + ': the circuit-breaker is open', 'open');
      return setImmediate(originalCallback, err);
    } else if (currentState === states[2]) {
      currentCooldown = Math.min(currentCooldown * (failures + 1), config.maxCooldown);
    }

    function catchError(err) {
      if (config.trigger(err)) {
        failures++;
        lastFailure = Date.now();
        if (failures >= config.maxFailures) {
          config.onTrip(err, failures, currentCooldown);
        }
      }
      originalCallback(err);
    }

    const timeout = setTimeout(() => {
      timedOut = true;
      catchError(new DisyuntorError(`${config.name}: specified timeout of ${config.timeout}ms was reached`, 'timeout'));
    }, config.timeout);

    function callback(err) {
      if (timedOut) { return; }
      clearTimeout(timeout);
      if (err) {
        return catchError(err);
      }
      reset();
      originalCallback.apply(null, arguments);
    }

    args[args.length - 1] = callback;

    protected.apply(null, args);
  }


  protector.reset = reset;

  return protector;
}

module.exports = wrapper;

module.exports.DisyuntorError = DisyuntorError;

module.exports.promise = function (protectedPromise, params) {
  if (typeof protectedPromise !== 'function') {
    throw new Error('expecting a function returning a promise but got ' + {}.toString.call(protectedPromise));
  }

  const protected = wrapper(function() {
    const args = Array.from(arguments);
    const callback = args.pop();
    const promise = protectedPromise.apply(null, args);

    if (!promise || !promise.then) {
      throw new Error('expecting function to return a promise but got ' + {}.toString.call(promise));
    }

    promise.then(function () {
      const resultArgs = [null].concat(Array.from(arguments));
      callback.apply(null, resultArgs);
    }, function (err) {
      callback(err);
    });
  }, params);

  return function() {
    const args = Array.from(arguments);

    return new Promise((resolve, reject) => {
      const callback = function (err) {
        if (err) { return reject(err); }
        const result = Array.from(arguments).slice(1);
        resolve.apply(null, result);
      };

      protected.apply(null, args.concat(callback));
    });
  };

};
