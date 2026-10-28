const argon2 = require('argon2');
const crypto = require('crypto');

const hashPassword = (plain) => argon2.hash(plain);
const verifyPassword = (hash, plain) => argon2.verify(hash, plain);

// For OTPs and refresh tokens we store only a SHA-256 hash.
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const randomOtp = (digits = 6) => {
  const max = 10 ** digits;
  return crypto.randomInt(0, max).toString().padStart(digits, '0');
};

module.exports = { hashPassword, verifyPassword, sha256, randomOtp };
