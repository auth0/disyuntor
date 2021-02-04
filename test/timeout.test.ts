import { create } from '../src/Timeout';
import { assert } from 'chai';

describe('When providing a timeout', () => {

    const name = 'timeoutTest';
    const milliseconds = 50;

    it('rejects when promise is too slow', (done) => {
        const slowPromise = new Promise<void>((resolve, reject) => {
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
