[![Build Status](https://travis-ci.org/auth0/disyuntor.svg?branch=master)](https://travis-ci.org/auth0/disyuntor)

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

## Basic usage

```javascript
const disyuntor = require('disyuntor');

const dnsSafeLookup = disyuntor.wrapCallbackApi({
  //This is used in error messages.
  name: 'dns.lookup',

  //Timeout for the protected function.
  // timeout: '2s',

  //The number of consecutive failures before switching to open mode
  //and stop calling the underlying service.
  // maxFailures: 5,

  //The minimum time the circuit remains open before doing another attempt.
  // cooldown: '15s',

  //The maximum amount of time the circuit remains open before doing a new attempt.
  // maxCooldown: '60s',

  //optionally log errors
  onTrip: (err, failures, cooldown) => {
    console.log(`dns.lookup triped because it failed ${failures} times.
Last error was ${err.message}! There will be no more attempts for ${cooldown}ms.`);
  },

  // //optional callback to prevent some errors to trigger the disyuntor logic
  // //in this case ENOTFOUND is passed to the callback and will
  // //not trigger the breaker eg:
  // trigger: (err) => err.code !== 'ENOTFOUND'
}, dns.lookup);

//then use as you will normally use dns.lookup
dnsSafeLookup('google.com', (err, ip) => {
  if (err) { return console.error(err.message); }
  console.log(ip);
})
```

Timeouts can be expressed either by strings like '15s' or by milliseconds.

Defaults values are:

- `timeout`: 2s
- `maxFailures`: 5
- `cooldown`: 15s
- `maxCooldown`: 60s


## Protecting Promise APIs

```javascript
const lookup = Promise.promisify(require('dns').lookup);

const protectedLookup = disyuntor.wrapPromiseApi({
  name: 'dns.lookup',
  timeout: '2s',
  maxFailures: 2
}, lookup);

protectedLookup('google.com')
  .then((ip)  => console.log(ip),
        (err) => console.error(err));
```

## Complex scenarios

You can create an instance of Disyuntor to have more control as follows:

```javascript
const Disyuntor = require('disyuntor').Disyuntor;

const disyuntor = new Disyuntor({
  name: 'dns.lookup',
  timeout: '2s',
  maxFailures: 2
});

await disyuntor.protect(() => dns.lookupAsync('google.com'));
```

Note: this api only supports promise-returning functions.
## License

Copyright (c) 2015 Auth0, Inc. <support@auth0.com> (http://auth0.com)

