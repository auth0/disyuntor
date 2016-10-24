const DisyuntorError = function DisyuntorError(message) {
  this.message = message;
  Error.captureStackTrace(this, this.constructor);
};

DisyuntorError.prototype = Object.create(Error);
DisyuntorError.prototype.constructor = DisyuntorError;
DisyuntorError.prototype.name = 'DisyuntorError';

module.exports = DisyuntorError;
