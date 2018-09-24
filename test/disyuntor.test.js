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

  describe('should throttle', function() {
    var sut;
    beforeEach(function () {
      sut = disyuntor({
        name: 'test.func',
        timeout: 10,
        maxFailures: 1,
        cooldown: '10ms',
        action: 'throttle',
        throttlePercent: 50
      }, (callback) => {
        callback(new Error('failure'));
      });
    });

    it('should allow requests through and fail others', function(done) {
      var open = false;
      var passthrough = false;
      sut(() => {
        async.parallel([
          done => sut(err => done(null, err)),
          done => sut(err => done(null, err)),
          done => sut(err => done(null, err)),
          done => sut(err => done(null, err)),
          done => sut(err => done(null, err)),
          done => sut(err => done(null, err)),
          done => sut(err => done(null, err)),
          done => sut(err => done(null, err)),
          done => sut(err => done(null, err))
        ], (err, errs) => {
          errs.forEach((err) => {
            if (err.message.indexOf('open') > -1) {
              open = true;
            }
            if (err.message === 'failure') {
              passthrough = true;
            }
          });
          assert.equal(open, true, 'There should be results with circuit open');
          assert.equal(passthrough, true, 'There should be results with the regular failure');
          done();
        });
      });
    });
  });
});
