'use strict'

const { create } = require('../src/Timeout');
const { assert } = require('chai');

describe('When providing a timeout', () => {

    const name = 'timeoutTest';
    const milliseconds = 50;

    it('rejects when promise is too slow', (done) => {
        const slowPromise = new Promise((resolve, reject) => {
            setTimeout(() => {
                resolve();
            }, milliseconds * 2);
        });

        const timeoutPromise = create(name, milliseconds, slowPromise);

        timeoutPromise.then(() => {
            assert.fail('promise running longer than timeout was resolved instead of rejected');
        }).catch((err) => {
            done();
        })

    });
});
