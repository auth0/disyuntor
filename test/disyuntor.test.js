const disyuntor = require('./..');
const assert = require('chai').assert;
const async = require('async');


describe('disyuntor', function () {

  it('should fail if name is undefined', function () {
    assert.throws(() => {
      disyuntor(() => {}, {});
    }, /params\.name is required/);
  });

  describe('when the protected function doesnt call back', function () {
    var monitorCalls = [];
    var sut;

    beforeEach(function () {
      monitorCalls = [];
      sut = disyuntor(cb => setTimeout(cb, 500), {
        name: 'test.func',
        timeout: '10ms',
        maxFailures: 1,
        cooldown: 200,
        maxCooldown: 400,
        monitor: details => monitorCalls.push(details)
      });
    });

    it('should fail with timeout', function (done) {
      var startTime = Date.now();
      sut(err => {
        assert.match(err.message, /test\.func: specified timeout of 10ms was reached/);
        assert.closeTo(Date.now() - startTime, 10, 10);
        assert.equal(monitorCalls.length, 0);
        done();
      });
    });

    it('should fail immediately after "maxFailures"', function (done) {
      sut(() => {
        var startTime = Date.now();
        sut(err => {
          assert.match(err.message, /test\.func: the circuit-breaker is open/);
          assert.closeTo(Date.now() - startTime, 1, 2);
          assert.equal(monitorCalls[0].err, err);
          done();
        });
      });
    });

    it('should try again after "cooldown" msecs', function (done) {
      sut(() => {
        setTimeout(() => {
          sut(err => {
            assert.match(err.message, /test\.func: specified timeout of 10ms was reached/);
            assert.equal(monitorCalls.length, 0);
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
            assert.equal(monitorCalls.length, 0);
            cb();
          });
        },

        //at this point the circuit is open, and is going back to half-open after 400ms.
        cb => setTimeout(cb, 200),
        cb => {
          sut(err => {
            assert.match(err.message, /test\.func: the circuit-breaker is open/);
            assert.equal(monitorCalls.length, 1);
            cb();
          });
        },

        cb => setTimeout(cb, 200),
        cb => {
          sut(err => {
            assert.match(err.message, /test\.func: specified timeout of 10ms was reached/);
            assert.equal(monitorCalls.length, 1);
            cb();
          });
        },

        //once reached the maxcooldown
        cb => setTimeout(cb, 400),
        cb => {
          sut(err => {
            assert.match(err.message, /test\.func: specified timeout of 10ms was reached/);
            assert.equal(monitorCalls.length, 1);
            cb();
          });
        },


      ], done);
    });
  });



  describe('when the protected function fails', function () {
    var monitorCalls = [];
    var sut;
    var fail = false;

    beforeEach(function () {
      monitorCalls = [];
      fail = false;
      sut = disyuntor((i, callback) => {
        if (fail) { return callback(new Error('failure')); }
        callback(null, i);
      }, {
        name: 'test.func',
        timeout: 10,
        maxFailures: 1,
        cooldown: 200,
        monitor: details => monitorCalls.push(details)
      });
    });

    it('should change to open if it fail', function (done) {
      fail = true;
      sut(2, err1 => {
        assert.equal(err1.message, 'failure');
        assert.equal(monitorCalls.length, 0);
        sut(2, err2 => {
          assert.match(err2.message, /test\.func: the circuit-breaker is open/);
          assert.equal(monitorCalls[0].err, err2);
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
      sut = disyuntor((i, callback) => {
        if (fail) { return callback(new Error('failure')); }
        callback(null, i);
      }, {
        name: 'test.func',
        timeout: 10,
        maxFailures: 1,
        cooldown: '100ms',
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
      sut = disyuntor((i, callback) => {
        if (fail) { return callback(new Error('failure')); }
        callback(null, i);
      }, {
        name: 'test.func',
        timeout: 10,
        maxFailures: 2,
        cooldown: '100ms',
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

});
