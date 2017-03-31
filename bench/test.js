// I am using this to trace deoptimizations.
const async = require('async');
const _ = require('lodash');

const disyuntor = require('./..');

const test = disyuntor((i, callback) => {
  setImmediate(callback);
}, { name: 'test function' });


const start = process.hrtime();

async.forEach(_.range(1e5), test, (err) => {
  if (err) {
    console.log(err);
    return console.error(err.message);
  }

  const diff = process.hrtime(start);
  const ns = diff[0] * 1e9 + diff[1];
  const ms = Math.ceil(ns / 1e6);
  console.log(`finished in ${ms}`);
});
