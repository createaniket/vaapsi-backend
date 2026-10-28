const { ZodError } = require('zod');
const { BadRequestError } = require('../utils/errors');

/**
 * Validates req[source] and writes the parsed (coerced, defaulted) values back.
 *
 * Note: in Express 5 `req.query` is a read-only getter, so Object.assign() on it
 * silently does nothing — Zod defaults like page/limit would be lost. We redefine
 * the property instead so downstream handlers see the parsed values.
 */
const validate =
  (schema, source = 'body') =>
  (req, _res, next) => {
    try {
      const parsed = schema.parse(req[source] || {});
      if (source === 'body') {
        Object.assign(req.body, parsed);
      } else {
        Object.defineProperty(req, source, {
          value: parsed,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(new BadRequestError('Validation failed', err.flatten().fieldErrors));
      }
      next(err);
    }
  };

module.exports = { validate };
