import { wrapPromise as disyuntor, DisyuntorError } from '../src/Disyuntor';
import { assert } from 'chai';
import otherAsync from 'async';
import bbPromise from 'bluebird';

describe('promise interface', function () {

  it('should throw an error if func is undefined', function () {
    try {
      //@ts-ignore
      disyuntor();
    } catch(err) {
      assert.match(err.message,
          /expecting a function returning a promise but got \[object Undefined\]/);
    }
  });

  it('should throw an error if func does not return a promise', function () {
    //@ts-ignore
    return disyuntor({ name: 'null.fail' }, () => {})()
      .catch((err: Error) => {
        assert.equal(err.message, 'expecting a promise but got [object Undefined]');
      });
  });

  describe('when the protected promise never ends', function () {
    let monitorCalls: any[] = [];
    let sut: Function;

    beforeEach(function () {
      monitorCalls = [];
      sut = disyuntor({
        name: 'test.func',
        timeout: 10,
        maxFailures: 1,
        cooldown: 200,
        maxCooldown: 400,
        onTrip: (err: Error, failures: number, cooldown: number) => monitorCalls.push({err, failures, cooldown})
      }, () => new bbPromise(() => {}));
    });

    it('should fail with timeout', function () {
      const startTime = Date.now();
      return sut().catch((err: Error) => {
        assert.match(err.message, /test\.func: specified timeout of 10ms was reached/);
        assert.closeTo(Date.now() - startTime, 10, 10);
        assert.equal(monitorCalls.length, 1);
      });
    });

    it('should fail immediately after "maxFailures"', function () {
      return sut().catch((originalError: Error) => {
        const startTime = Date.now();
        return sut().catch((err: Error) => {
          assert.instanceOf(err, Error);
          assert.instanceOf(err, DisyuntorError);
          assert.match(err.message, /test\.func: the circuit-breaker is open/);
          assert.closeTo(Date.now() - startTime, 1, 2);
          assert.equal(monitorCalls[0].err, originalError);
        });
      });
    });

    it('should try again after "cooldown" msecs', function (done) {
      sut().catch(() => {
        setTimeout(() => {
          sut().catch((err: Error) => {
            assert.match(err.message, /test\.func: specified timeout of 10ms was reached/);
            assert.equal(monitorCalls.length, 2);
            done();
          });
        }, 200);
      });
    });

    it('should backoff on multiple failures', function (done) {
      otherAsync.series([
        (cb: () => any) => sut().catch(() => cb()),

        //first cooldown of 200ms
        (cb: () => any) => setTimeout(cb, 200),
        (cb: () => any) => {
          sut().catch((err: Error) => {
            assert.match(err.message, /test\.func: specified timeout of 10ms was reached/);
            cb();
          });
        },

        //at this point the circuit is open, and is going back to half-open after 400ms.
        (cb: () => any) => setTimeout(cb, 200),
        (cb: () => any) => {
          sut().catch((err: Error) => {
            assert.match(err.message, /test\.func: the circuit-breaker is open/);
            cb();
          });
        },

        (cb: () => any) => setTimeout(cb, 200),
        (cb: () => any) => {
          sut().catch((err: Error) => {
            assert.match(err.message, /test\.func: specified timeout of 10ms was reached/);
            cb();
          });
        },

        //once reached the maxcooldown
        (cb: () => any) => setTimeout(cb, 400),
        (cb: () => any) => {
          sut().catch((err: Error) => {
            assert.match(err.message, /test\.func: specified timeout of 10ms was reached/);
            cb();
          });
        },


      ], done);
    });
  });



  describe('when the protected promise fails', function () {
    let monitorCalls: any[] = [];
    let sut: Function;
    let fail: boolean = false;

    beforeEach(function () {
      monitorCalls = [];
      fail = false;
      sut = disyuntor({
        name: 'test.func',
        timeout: 10,
        maxFailures: 1,
        cooldown: 200,
        onTrip: (err: Error, failures: number, cooldown: number) => monitorCalls.push({ err, failures, cooldown })
      }, (i: any) => {
        return new bbPromise((resolve: (arg0: any) => void, reject: (arg0: Error) => any) => {
          if (fail) {
            return reject(new Error('failure'));
          }
          resolve(i);
        });
      });
    });

    it('should change to open if it fail', function () {
      fail = true;
      return sut(2).catch((err1: Error) => {
        assert.equal(err1.message, 'failure');
        assert.equal(monitorCalls.length, 1);
        return sut(2).catch((err2: Error) => {
          assert.match(err2.message, /test\.func: the circuit-breaker is open/);
          assert.equal(monitorCalls[0].err, err1);
        });
      });
    });

    it('should remain closed if it works', function () {
      return sut(2).then(function (result: any) {
        assert.equal(result, 2);
      });
    });

    it('should change to closed once it works', function () {
      fail = true;

      return sut(2)
              .catch(() => bbPromise.delay(200))
              .then(() => {
                fail = false;
                return sut(2);
              }).then((result: any) => {
                assert.equal(result, 2);
              })
              .then(() => sut(3))
              .then((result: any) => {
                assert.equal(result, 3);
              });
    });
  });

});
