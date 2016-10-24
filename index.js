const ms = require('ms');
const DisyuntorError = require('./lib/DisyuntorError');

const defaults = {
  timeout: '2s',
  maxFailures: 5,
  cooldown: '15s',
  monitor: () => {}
};

const timeProps = ['timeout', 'cooldown', 'maxCooldown'];

const states = ['closed', 'open', 'half open'];

module.exports = function wrapper (protected, params) {
  const config = Object.assign({}, defaults, params);

  if (typeof config.name === 'undefined') {
    throw new Error('params.name is required');
  }

  if (typeof config.maxCooldown === 'undefined') {
    config.maxCooldown = config.cooldown * 3;
  }

  //convert properties to milliseconds.
  timeProps.forEach(p => {
    config[p] = typeof config[p] === 'string' ? ms(config[p]) : config[p];
  });

  var failures = 0;
  var lastFailure = 0;
  var currentCooldown = config.cooldown;

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

  return function () {
    const args = Array.from(arguments);
    const originalCallback = args.pop();
    var timedout = false;


    const currentState = getState();

    if (currentState === states[1]) {
      const err = new DisyuntorError(`${config.name}: the circuit-breaker is open`);
      return setImmediate(originalCallback, err);
    }

    function catchError(err) {
      failures++;
      lastFailure = Date.now();
      currentCooldown = Math.min(currentCooldown * failures, config.maxCooldown);
      config.monitor({err, args});
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
      originalCallback.apply(null, arguments);
    }

    protected.apply(null, args.concat([callback]));
  };
};
