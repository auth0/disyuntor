const util = require('util');

const DisyuntorError = function DisyuntorError(message) {
  this.message = message;
  Error.captureStackTrace(this, this.constructor);
};

util.inherits(DisyuntorError, Error);

module.exports = DisyuntorError;
