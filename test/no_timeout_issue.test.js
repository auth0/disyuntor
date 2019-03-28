const { assert } = require('chai');
const Disyuntor = require('../lib/Disyuntor').Disyuntor;

function sleep (time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

describe('an issue when timeout is disabled', () => {
  let disyuntor = new Disyuntor({
    maxFailures: 3,
    cooldown: 100,
    timeout: false,
    name: 'no_timeout'
  });


  it('should switch to close after cool down', async () => {
    const ignoreErr = () => {}
    const throwErr = () => { throw new Error('ue'); };
    const return1 = () => 1;

    await disyuntor.protect(throwErr).catch(ignoreErr);
    await disyuntor.protect(throwErr).catch(ignoreErr);
    await disyuntor.protect(throwErr).catch(ignoreErr);

    try {
      await disyuntor.protect(throwErr)
    } catch(err) {
      assert.include(err.message, 'circuit-breaker is open');
    }

    await sleep(100);

    await disyuntor.protect(return1);
    await disyuntor.protect(return1);
    await disyuntor.protect(return1);
  });


});
