const DisyuntorError = function DisyuntorError(message) {
  this.message = message;
  Error.captureStackTrace(this, this.constructor);
};

DisyuntorError.prototype = new Error();

module.exports = DisyuntorError;
