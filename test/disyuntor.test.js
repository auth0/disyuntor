const Disyuntor = require('../lib/Disyuntor').Disyuntor;
const disyuntor = require('../lib/Disyuntor').wrapCallbackApi;
const assert = require('chai').assert;
const async = require('async');

describe('disyuntor', function () {

  it('should fail if name is undefined', function () {
    assert.throws(() => {
      disyuntor({}, () => {});
    }, /params\.name is required/);
  });

  describe('when the protected function doesnt call back', function () {
    var tripCalls = [];
    var sut;

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
      sut(err => {
        assert.match(err.message, /test\.func: specified timeout of 10ms was reached/);
        assert.closeTo(Date.now() - startTime, 10, 10);
        assert.equal(tripCalls.length, 1);
        done();
      });
    });

    it('should fail immediately after "maxFailures"', function (done) {
      sut((originalError) => {
        var startTime = Date.now();
        sut(err => {
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
          sut(err => {
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
          async.parallel([
            done => sut(err => done(null, err)),
            done => sut(err => done(null, err)),
          ], (err, errs) => {
            assert.match(errs[0].message, /test\.func: specified timeout of 10ms was reached/);
            assert.match(errs[1].message, /test\.func: the circuit-breaker is open/);
            done();
          });
        }, 200);
      });
    });

    it('should close the circuit after success on half-open state', function (done) {
      let error = new Error();

      protectedFunction = disyuntor({
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

      async.series([
        // Open the circuit
        cb => {
          error = new Error('error-1');
          protectedFunction((err, r) => cb(null, { err, r }))
        },
        cb => {
          error = new Error('error-2');
          protectedFunction((err, r) => cb(null, { err, r }))
        },
        cb => {
          error = new Error('error-3');
          protectedFunction((err, r) => cb(null, { err, r }))
        },

        // Wait cooldown
        cb => setTimeout(cb, 250),

        // This should move state from half open to closed
        cb => {
          error = null;
          protectedFunction((err, r) => cb(null, { err, r }))
        },

        // Fail again, this should not open the circuit because failures should
        // have reset
        cb => {
          error = new Error('error-4');
          protectedFunction((err, r) => cb(null, { err, r }))
        },

        cb => {
          error = new Error('error-5');
          protectedFunction((err, r) => cb(null, { err, r }));
        }
      ], (err, results) => {
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
      let closeEvents = [];

      protectedFunction = disyuntor({
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

      async.series([
        // Open the circuit
        cb => {
          error = new Error('error-1');
          protectedFunction((err, r) => cb(null, { err, r }))
        },
        cb => {
          error = new Error('error-2');
          protectedFunction((err, r) => cb(null, { err, r }))
        },
        cb => {
          error = new Error('error-3');
          protectedFunction((err, r) => cb(null, { err, r }))
        },

        // Wait cooldown
        cb => setTimeout(cb, 250),

        // This should move state from half open to closed
        cb => {
          error = null;
          protectedFunction((err, r) => cb(null, { err, r }))
        },

        // Fail again, this should not open the circuit because failures should
        // have reset
        cb => {
          error = new Error('error-4');
          protectedFunction((err, r) => cb(null, { err, r }))
        },
      ], (err) => {
        assert.ifError(err);

        assert.equal(closeEvents.length, 1);
        assert.deepEqual(closeEvents[0], { cooldown: 200, });

        done();
      });
    });

    it('should backoff on multiple failures', function (done) {
      async.series([
        cb => sut(() => cb()),

        //first cooldown of 200ms
        cb => setTimeout(cb, 200),
        cb => {
          sut(err => {
            assert.match(err.message, /test\.func: specified timeout of 10ms was reached/);
            assert.equal(tripCalls.length, 2);
            cb();
          });
        },

        //at this point the circuit is open, and is going back to half-open after 400ms.
        cb => setTimeout(cb, 200),
        cb => {
          sut(err => {
            assert.match(err.message, /test\.func: the circuit-breaker is open/);
            assert.equal(tripCalls.length, 2);
            cb();
          });
        },

        cb => setTimeout(cb, 200),
        cb => {
          sut(err => {
            assert.match(err.message, /test\.func: specified timeout of 10ms was reached/);
            assert.equal(tripCalls.length, 3);
            cb();
          });
        },

        //once reached the maxcooldown
        cb => setTimeout(cb, 400),
        cb => {
          sut(err => {
            assert.match(err.message, /test\.func: specified timeout of 10ms was reached/);
            assert.equal(tripCalls.length, 4);
            cb();
          });
        },


      ], done);
    });
  });


  describe('when timeout is disabled', function () {
    var tripCalls = [];
    var sut;

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
      sut(err => done(err));
    });
  });

  describe('when the protected function fails', function () {
    var tripCalls = [];
    var sut;
    var fail = false;

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
      sut(2, err1 => {
        assert.equal(err1.message, 'failure');
        assert.equal(tripCalls.length, 1);
        sut(2, err2 => {
          assert.match(err2.message, /test\.func: the circuit-breaker is open/);
          assert.equal(tripCalls[0].err, err1);
          done();
        });
      });
    });

    it('should remain closed if it works', function (done) {
      sut(2, (err1, result) => {
        assert.notOk(err1);
        assert.equal(result, 2);
        done();
      });
    });

    it('should change to closed once it works', function (done) {
      fail = true;
      async.series([
        cb => sut(2, () => cb()),
        cb => setTimeout(cb, 200),
        cb => {
          fail = false;
          sut(2, (err, result) => {
            assert.equal(result, 2);
            cb();
          });
        },
        cb => {
          sut(3, (err, result) => {
            assert.equal(result, 3);
            cb();
          });
        },
      ], done);
    });
  });

  describe('issue with cooldown(str) and default maxCooldown', function () {
    var sut;
    var fail = false;

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
      async.series([
        cb => sut(2, () => cb()),
        cb => {
          sut(3, (err) => {
            assert.equal(err.message, 'test.func: the circuit-breaker is open');
            cb();
          });
        },
      ], done);
    });
  });

  describe('reseting after cooldown', function () {
    var sut;
    var fail = false;

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
      async.series([
        //fail twice
        cb => sut(2, () => cb()),
        cb => sut(2, () => cb()),
        //circuit is open
        cb => {
          sut(3, (err) => {
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
          sut(3, (err) => {
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
        return disyuntor.protect(async () => 1);
      }).then(() => {
        //fail
        return disyuntor.protect(() => {
          throw new Error('error 1');
        });
      }).catch(() => {
        disyuntor.protect(async () => 1);
      });

    });
  });
});
