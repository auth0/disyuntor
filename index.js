const ms = require('ms');
const DisyuntorError = require('./lib/DisyuntorError');

const defaults = {
  timeout:     '2s',
  maxFailures: 5,
  cooldown:    '15s',
  arity:       'auto',
  onTrip:      () => {},
  trigger:     () => true
};

const timeProps = ['timeout', 'cooldown', 'maxCooldown'];

const states = ['closed', 'open', 'half open'];

const Promise = require('bluebird');

function wrapper (protected, params) {
  const config = Object.assign({}, defaults, params);

  if (typeof config.name === 'undefined') {
    throw new Error('params.name is required');
  }

  //convert properties to milliseconds.
  timeProps.forEach(p => {
    config[p] = typeof config[p] === 'string' ? ms(config[p]) : config[p];
  });

  if (typeof config.maxCooldown === 'undefined') {
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
    const argLength = arguments.length;
    const args = arguments;
    const originalCallback = arguments[argLength - 1];

    var timedout = false;

    const currentState = getState();

    if (currentState === states[1]) {
      const err = new DisyuntorError(`${config.name}: the circuit-breaker is open`);
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
      timedout = true;
      catchError(new DisyuntorError(`${config.name}: specified timeout of ${config.timeout}ms was reached`));
    }, config.timeout);

    function callback(err) {
      if (timedout) { return; }
      clearTimeout(timeout);
      if (err) {
        return catchError(err);
      }
      reset();
      originalCallback.apply(null, arguments);
    }

    args[argLength - 1] = callback;

    protected.apply(null, args);
  }


  protector.reset = reset;

  return protector;
}

module.exports = wrapper;

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
