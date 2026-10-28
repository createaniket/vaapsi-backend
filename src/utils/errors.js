// Central error hierarchy — thrown anywhere, handled by errorHandler middleware.
class AppError extends Error {
  constructor(statusCode, message, code = 'APP_ERROR', details) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.name = this.constructor.name;
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Bad request', details) { super(400, message, 'BAD_REQUEST', details); }
}
class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') { super(401, message, 'UNAUTHORIZED'); }
}
class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') { super(403, message, 'FORBIDDEN'); }
}
class NotFoundError extends AppError {
  constructor(message = 'Not found') { super(404, message, 'NOT_FOUND'); }
}
class ConflictError extends AppError {
  constructor(message = 'Conflict', details) { super(409, message, 'CONFLICT', details); }
}

module.exports = { AppError, BadRequestError, UnauthorizedError, ForbiddenError, NotFoundError, ConflictError };
