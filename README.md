A [circuit-breaker](http://martinfowler.com/bliki/CircuitBreaker.html) implementation for node.js with exponential backoff.

**Disyuntor** is the Spanish word used for circuit-breaker.

The purpose of this pattern is to detect errors and prevent cascading failures across multiple systems.

Disyuntor wraps an async (errback) function and returns a new function with the same signature.

During normal behavior of the system the circuit remains in its `closed` state. This means that every call to the wrapper is forwarded to the protected function.

Once the protected function returns more than `maxFailures`, the breaker trips and every call made during the `cooldown` interval will immdiately return an error preventing resource depletion. This is known as the `open` state.

Once the system has settled it will allow one call to go to the protected function. If the call succeds the breaker will be reset to its `closed` state otherwise it will continue `open`. This state is known as `half open`

A call is considered to have failed if the callback is not called before the `timeout` or if it is called with the first (error) parameter.

## Installation

```
npm i disyuntor
```

## Usage

```javascript
const disyuntor = require('disyuntor');

const dnsSafeLookup = disyuntor(dns.lookup, {
  //Maximum time that the underlying function can take before is considered faulty.
  timeout: '2s',

  //The number of consecutive failures before switching to open mode
  //and stop calling the underlying service.
  maxFailures: 5,

  //The minimum time the circuit will be open before doing another attempt.
  cooldown: '15s',

  //The maximum amount of time the circuit will be open before doing a new attempt.
  maxCooldown: '60s',

  //this is used in error messages.
  name: 'dns.lookup',

  //optionally log errors
  monitor: (err) => logger.panic({ err }, 'Error on dns.lookup')
});
```

Defaults values are:

- `timeout`: 2s
- `maxFailures`: 5
- `cooldown`: 15s
- `maxCooldown`: 3 * cooldown

## License

MIT 2016 - José F. Romaniello

