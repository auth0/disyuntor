const DisyuntorError = function DisyuntorError(message, reason) {
  this.message = message;
  this.reason = reason;
  Error.captureStackTrace(this, this.constructor);
};

DisyuntorError.prototype = new Error();

module.exports = DisyuntorError;
