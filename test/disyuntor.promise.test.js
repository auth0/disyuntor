const disyuntor = require('./..');
const assert    = require('chai').assert;
const async     = require('async');
const Promise   = require('bluebird');

describe('disyuntor (promise)', function () {

  it('should throw an error if func is undefined', function () {
    assert.throw(() => {
      disyuntor.promise();
    }, /expecting a function returning a promise but got \[object Undefined\]/);
  });

  describe('when the protected promise never ends', function () {
    var monitorCalls = [];
    var sut;

    beforeEach(function () {
      monitorCalls = [];
      sut = disyuntor.promise(() => new Promise(() => {}), {
        name: 'test.func',
        timeout: 10,
        maxFailures: 1,
        cooldown: 200,
        maxCooldown: 400,
        monitor: details => monitorCalls.push(details)
      });
    });

    it('should fail with timeout', function (done) {
      var startTime = Date.now();
      sut().catch(err => {
        assert.match(err.message, /test\.func: specified timeout of 10ms was reached/);
        assert.closeTo(Date.now() - startTime, 10, 10);
        assert.equal(monitorCalls[0].err, err);
        assert.equal(monitorCalls[0].args.length, 0);
        done();
      });
    });

    it('should fail immediately after "maxFailures"', function (done) {
      sut().catch((err1) => {
        var startTime = Date.now();
        sut().catch(err2 => {
          assert.match(err2.message, /test\.func: the circuit-breaker is open/);
          assert.closeTo(Date.now() - startTime, 1, 2);
          assert.equal(monitorCalls[0].err, err1);
          assert.equal(monitorCalls[0].args.length, 0);
          done();
        });
      });
    });

    it('should try again after "cooldown" msecs', function (done) {
      sut().catch(() => {
        setTimeout(() => {
          sut().catch((err) => {
            assert.match(err.message, /test\.func: specified timeout of 10ms was reached/);
            assert.equal(monitorCalls[1].err, err);
            assert.equal(monitorCalls[1].args.length, 0);
            done();
          });
        }, 200);
      });
    });

    it('should backoff on multiple failures', function (done) {
      async.series([
        cb => sut().catch(() => cb()),

        //first cooldown of 200ms
        cb => setTimeout(cb, 200),
        cb => {
          sut().catch(err => {
            assert.match(err.message, /test\.func: specified timeout of 10ms was reached/);
            cb();
          });
        },

        //at this point the circuit is open, and is going back to half-open after 400ms.
        cb => setTimeout(cb, 200),
        cb => {
          sut().catch(err => {
            assert.match(err.message, /test\.func: the circuit-breaker is open/);
            cb();
          });
        },

        cb => setTimeout(cb, 200),
        cb => {
          sut().catch(err => {
            assert.match(err.message, /test\.func: specified timeout of 10ms was reached/);
            cb();
          });
        },

        //once reached the maxcooldown
        cb => setTimeout(cb, 400),
        cb => {
          sut().catch(err => {
            assert.match(err.message, /test\.func: specified timeout of 10ms was reached/);
            cb();
          });
        },


      ], done);
    });
  });



  describe('when the protected promise fails', function () {
    var monitorCalls = [];
    var sut;
    var fail = false;

    beforeEach(function () {
      monitorCalls = [];
      fail = false;
      sut = disyuntor.promise((i) => {
        return new Promise((resolve, reject) => {
          if (fail) {
            return reject(new Error('failure'));
          }
          resolve(i);
        });
      }, {
        name: 'test.func',
        timeout: 10,
        maxFailures: 1,
        cooldown: 200,
        monitor: details => monitorCalls.push(details)
      });
    });

    it('should change to open if it fail', function () {
      fail = true;
      return sut(2).catch(err1 => {
        assert.equal(err1.message, 'failure');
        assert.equal(monitorCalls[0].err, err1);
        assert.equal(monitorCalls[0].args.length, 1);
        assert.equal(monitorCalls[0].args[0], 2);
        return sut(2).catch(err2 => {
          assert.match(err2.message, /test\.func: the circuit-breaker is open/);
        });
      });
    });

    it('should remain closed if it works', function () {
      return sut(2).then(function (result) {
        assert.equal(result, 2);
      });
    });

    it('should change to closed once it works', function () {
      fail = true;

      return sut(2)
              .catch(() => Promise.delay(200))
              .then(() => {
                fail = false;
                return sut(2);
              }).then(result => {
                assert.equal(result, 2);
              })
              .then(() => sut(3))
              .then(result => {
                assert.equal(result, 3);
              });
    });
  });

});
