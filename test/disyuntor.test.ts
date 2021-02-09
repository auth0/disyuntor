import { Disyuntor, wrapCallbackApi as disyuntor} from "../src/Disyuntor";
import { assert } from 'chai';
import * as otherAsync from 'async';

describe('disyuntor', function () {

  it('should fail if name is undefined', function () {
    assert.throws(() => {
      // @ts-ignore
      disyuntor({}, () => {});
    }, /params\.name is required/);
  });

  describe('when the protected function doesnt call back', function () {
    let tripCalls: any[] = [];
    let sut: Function;

    beforeEach(function () {
      tripCalls = [];
      sut = disyuntor({
        name: 'test.func',
        timeout: '10ms',
        maxFailures: 1,
        cooldown: 200,
        maxCooldown: 400,
        onTrip: (err, failures, cooldown) => tripCalls.push({err, failures, cooldown}),
      }, function(cb) {
        setTimeout(cb, 500)
      });
    });

    it('should fail with timeout', function (done) {
      var startTime = Date.now();
      sut((err: Error) => {
        assert.match(err.message, /test\.func: specified timeout of 10ms was reached/);
        assert.closeTo(Date.now() - startTime, 10, 10);
        assert.equal(tripCalls.length, 1);
        done();
      });
    });

    it('should fail immediately after "maxFailures"', function (done) {
      sut((originalError: Error) => {
        var startTime = Date.now();
        sut((err: Error) => {
          assert.match(err.message, /test\.func: the circuit-breaker is open/);
          assert.closeTo(Date.now() - startTime, 1, 2);
          assert.equal(tripCalls[0].err, originalError);
          done();
        });
      });
    });

    it('should try again after "cooldown" msecs', function (done) {
      sut(() => {
        setTimeout(() => {
          sut((err: Error) => {
            assert.match(err.message, /test\.func: specified timeout of 10ms was reached/);
            assert.equal(tripCalls.length, 2);
            done();
          });
        }, 200);
      });
    });

    it('should allow only one attempt on the half-open state', function (done) {
      sut(() => {
        setTimeout(() => {
          otherAsync.parallel([
            done => sut((err: Error) => done(null, err)),
            done => sut((err: Error) => done(null, err)),
          ], (err: Error | null | undefined, errs: Error[]) => {
            assert.match(errs[0].message, /test\.func: specified timeout of 10ms was reached/);
            assert.match(errs[1].message, /test\.func: the circuit-breaker is open/);
            done();
          });
        }, 200);
      });
    });

    it('should close the circuit after success on half-open state', function (done) {
      // FIXME lexical scope is shared between ALL protectedFunction calls.  Why?
      let error = new Error();

      let protectedFunction = disyuntor({
        name: 'test.func',
        timeout: '10ms',
        maxFailures: 2,
        cooldown: 200,
        maxCooldown: 400,
        onTrip: (err, failures, cooldown) => tripCalls.push({err, failures, cooldown}),
      }, function(cb) {
        if (error) {
          return cb(error);
        }

        return cb(null, { succeed: true });
      });

      otherAsync.series([
        // Open the circuit
        cb => {
          error = new Error('error-1');
          protectedFunction((err: Error, r: any) => cb(null, { err, r }))
        },
        cb => {
          error = new Error('error-2');
          protectedFunction((err: Error, r: any) => cb(null, { err, r }))
        },
        cb => {
          error = new Error('error-3');
          protectedFunction((err: Error, r: any) => cb(null, { err, r }))
        },

        // Wait cooldown
        cb => setTimeout(cb, 250),

        // This should move state from half open to closed
        cb => {
          error = null;
          protectedFunction((err: Error, r: any) => cb(null, { err, r }))
        },

        // Fail again, this should not open the circuit because failures should
        // have reset
        cb => {
          error = new Error('error-4');
          protectedFunction((err: Error, r: any) => cb(null, { err, r }))
        },

        cb => {
          error = new Error('error-5');
          protectedFunction((err: Error, r: any) => cb(null, { err, r }));
        }
      ], (err: Error, results: {err: Error, r: any}[]) => {
        assert.ifError(err);

        // No circuit breaker open error
        assert.equal(results[0].err.message, 'error-1');
        assert.equal(results[1].err.message, 'error-2');
        assert.equal(results[2].err.message, 'test.func: the circuit-breaker is open');
        assert.equal(results[4].r.succeed, true);
        assert.equal(results[5].err.message, 'error-4');
        assert.equal(results[6].err.message, 'error-5');

        done();
      });
    });


    it('should call onClose after closing in half open state', (done) => {
      let closeEvents: any[] = [];
      // FIXME lexical scope is shared between ALL protectedFunction calls.  Why?
      let error = new Error;

      let protectedFunction = disyuntor({
        name: 'test.func',
        timeout: '10ms',
        maxFailures: 2,
        cooldown: 200,
        maxCooldown: 400,
        onTrip: (err, failures, cooldown) => tripCalls.push({err, failures, cooldown}),
        onClose: (cooldown) => { closeEvents.push({ cooldown}); }
      }, function(cb) {
        if (error) {
          return cb(error);
        }

        return cb(null, { succeed: true });
      });

      otherAsync.series([
        // Open the circuit
        cb => {
          error = new Error('error-1');
          protectedFunction((err: Error, r: any) => cb(null, { err, r }))
        },
        cb => {
          error = new Error('error-2');
          protectedFunction((err: Error, r: any) => cb(null, { err, r }))
        },
        cb => {
          error = new Error('error-3');
          protectedFunction((err: Error, r: any) => cb(null, { err, r }))
        },

        // Wait cooldown
        cb => setTimeout(cb, 250),

        // This should move state from half open to closed
        cb => {
          error = null;
          protectedFunction((err: Error, r: any) => cb(null, { err, r }))
        },

        // Fail again, this should not open the circuit because failures should
        // have reset
        cb => {
          error = new Error('error-4');
          protectedFunction((err: Error, r: any) => cb(null, { err, r }))
        },
      ], (err) => {
        assert.ifError(err);

        assert.equal(closeEvents.length, 1);
        assert.deepEqual(closeEvents[0], { cooldown: 200, });

        done();
      });
    });

    it('should backoff on multiple failures', function (done) {
      otherAsync.series([
        cb => sut(() => cb()),

        //first cooldown of 200ms
        cb => setTimeout(cb, 200),
        cb => {
          sut((err: Error) => {
            assert.match(err.message, /test\.func: specified timeout of 10ms was reached/);
            assert.equal(tripCalls.length, 2);
            cb();
          });
        },

        //at this point the circuit is open, and is going back to half-open after 400ms.
        cb => setTimeout(cb, 200),
        cb => {
          sut((err: Error) => {
            assert.match(err.message, /test\.func: the circuit-breaker is open/);
            assert.equal(tripCalls.length, 2);
            cb();
          });
        },

        cb => setTimeout(cb, 200),
        cb => {
          sut((err: Error) => {
            assert.match(err.message, /test\.func: specified timeout of 10ms was reached/);
            assert.equal(tripCalls.length, 3);
            cb();
          });
        },

        //once reached the maxcooldown
        cb => setTimeout(cb, 400),
        cb => {
          sut((err: Error) => {
            assert.match(err.message, /test\.func: specified timeout of 10ms was reached/);
            assert.equal(tripCalls.length, 4);
            cb();
          });
        },


      ], done);
    });
  });


  describe('when timeout is disabled', function () {
    let tripCalls: any[] = [];
    let sut: Function;

    beforeEach(function () {
      tripCalls = [];
      sut = disyuntor({
        name: 'test.func',
        timeout: false,
        maxFailures: 1,
        cooldown: 200,
        maxCooldown: 400,
        onTrip: (err, failures, cooldown) => tripCalls.push({err, failures, cooldown}),
      }, function(cb) {
        setTimeout(cb, 500)
      });
    });

    it('should not fail with timeout', function (done) {
      sut((err: Error) => done(err));
    });
  });

  describe('when the protected function fails', function () {
    let tripCalls: any[] = [];
    let sut: Function;
    let fail: boolean = false;

    beforeEach(function () {
      tripCalls = [];
      fail = false;
      sut = disyuntor({
        name: 'test.func',
        timeout: 10,
        maxFailures: 1,
        cooldown: 200,
        onTrip: (err, failures, cooldown) => tripCalls.push({err, failures, cooldown}),
      }, (i, callback) => {
        if (fail) { return callback(new Error('failure')); }
        callback(null, i);
      });
    });

    it('should change to open if it fail', function (done) {
      fail = true;
      sut(2, (err1: Error) => {
        assert.equal(err1.message, 'failure');
        assert.equal(tripCalls.length, 1);
        sut(2, (err2: Error) => {
          assert.match(err2.message, /test\.func: the circuit-breaker is open/);
          assert.equal(tripCalls[0].err, err1);
          done();
        });
      });
    });

    it('should remain closed if it works', function (done) {
      sut(2, (err1: Error, result: any) => {
        assert.notOk(err1);
        assert.equal(result, 2);
        done();
      });
    });

    it('should change to closed once it works', function (done) {
      fail = true;
      otherAsync.series([
        cb => sut(2, () => cb()),
        cb => setTimeout(cb, 200),
        cb => {
          fail = false;
          sut(2, (err: Error, result: any) => {
            assert.equal(result, 2);
            cb();
          });
        },
        cb => {
          sut(3, (err: Error, result: any) => {
            assert.equal(result, 3);
            cb();
          });
        },
      ], done);
    });
  });

  describe('issue with cooldown(str) and default maxCooldown', function () {
    let sut: Function;
    let fail: boolean = false;

    beforeEach(function () {
      fail = false;
      sut = disyuntor({
        name: 'test.func',
        timeout: 10,
        maxFailures: 1,
        cooldown: '100ms',
      }, (i, callback) => {
        if (fail) { return callback(new Error('failure')); }
        callback(null, i);
      });
    });

    it('should continue open', function (done) {
      fail = true;
      otherAsync.series([
        cb => sut(2, () => cb()),
        cb => {
          sut(3, (err: Error) => {
            assert.equal(err.message, 'test.func: the circuit-breaker is open');
            cb();
          });
        },
      ], done);
    });
  });

  describe('reseting after cooldown', function () {
    let sut: Function;
    let fail: boolean = false;

    beforeEach(function () {
      fail = false;
      sut = disyuntor({
        name: 'test.func',
        timeout: 10,
        maxFailures: 2,
        cooldown: '100ms',
      }, (i, callback) => {
        if (fail) { return callback(new Error('failure')); }
        callback(null, i);
      });
    });


    it('should work', function (done) {
      fail = true;
      otherAsync.series([
        //fail twice
        cb => sut(2, () => cb()),
        cb => sut(2, () => cb()),
        //circuit is open
        cb => {
          sut(3, (err: Error) => {
            assert.equal(err.message, 'test.func: the circuit-breaker is open');
            cb();
          });
        },
        //wait the circuits cooldown
        cb => setTimeout(cb, 100),
        //this one works
        cb => {
          //reset the breaker
          fail = false;
          sut(2, () => cb());
        },
        //fail
        cb => {
          fail = true;
          sut(2, () => cb());
        },
        //circuit should be still closed because maxFailures is 2.
        cb => {
          sut(3, (err: Error) => {
            assert.equal(err.message, 'failure');
            cb();
          });
        },
      ], done);
    });


  });

  describe('intermitent failures', function() {
    it('should count failures in a row', function() {
      const disyuntor = new Disyuntor({
        name: 'disyuntor test',
        maxFailures: 2,
      });

      //fail
      return disyuntor.protect(() => {
        throw new Error('error 1');
      }).catch(() => {
        //works
        return disyuntor.protect(() => Promise.resolve(1));
      }).then(() => {
        //fail
        return disyuntor.protect(() => {
          throw new Error('error 1');
        });
      }).catch(() => {
        disyuntor.protect(() => Promise.resolve(1));
      });

    });
  });

  describe('currentCooldown NaN issue', function() {
    /*
    Tests that when no maxCooldown is provided that currentCooldown
    is not NaN
     */
    it('current cooldown not NaN on half-open', function(done) {
        const disyuntor = new Disyuntor({
            name: 'disyuntor test',
            maxFailures: 1,
            cooldown: 1,
        });

        // set failures to 1 in order to force an state transition to either (Open|HalfOpen)
        disyuntor.failures = 1;
        // trigger disyuntor HalfOpen state in order to trigger currentCooldown calculation
        disyuntor.currentCooldown = -Infinity;
        disyuntor.protect(() => {
            throw new Error('error 1');
        }).catch(() => {
        }).then(() => {
          assert.equal(-Infinity, disyuntor.currentCooldown);
          done();
        });
    });
  });

  describe('when callback has more than one result', function() {

    it('passes ALL of the results to the callback', (done) => {
      const doMathOnFourNumbers = (num1: number, num2: number, cb: (err: any, sum: number, avg: number) => void) => {
        const sum = num1 + num2;
        const avg = sum / 2;
        cb(null, sum, avg);
      }

      const protectedMathOnFourNumbers = disyuntor({ name: 'mathOnFourNumbers' }, doMathOnFourNumbers);

      protectedMathOnFourNumbers(10, 20, (err, sum, avg) => {
        assert.equal(sum, 30);
        assert.equal(avg, 15);
        done();
      });
    });

    it('does not incorrectly expand an array argument', (done) => {
      const returnAnArray = (callback) => setImmediate(() => callback(null, [1, 2, 3]));

      const protectedReturnAnArray = disyuntor({ name: 'returnAnArray' }, returnAnArray);

      protectedReturnAnArray((err, vals) => {
        assert.equal(vals[0], 1);
        assert.equal(vals[1], 2);
        assert.equal(vals[2], 3);
        done();
      });
    });
  });
});
