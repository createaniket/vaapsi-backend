const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { env } = require('../config/env');

function signAccessToken(payload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.ACCESS_TOKEN_TTL });
}
function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

/**
 * Mint a refresh token.
 *
 * ## Why there is a `jti`
 *
 * Without it the payload is `{ sub, iat, exp }` — and `iat`/`exp` are whole
 * seconds. Two refresh tokens minted for the same user in the same second were
 * therefore **byte-identical**, so their SHA-256 matched, and the UNIQUE
 * constraint on `refresh_tokens.token_hash` rejected the second one with a
 * constraint violation surfacing as a 409.
 *
 * That is not a theoretical race. It fires when two tabs sign in together, when
 * a client retries after a timeout, when someone signs in immediately after a
 * password reset, and whenever `/auth/refresh` is called twice inside a second.
 *
 * A random `jti` makes every issuance unique, which is what the storage layer
 * already assumed. It also gives each token an identity of its own, which is
 * what you would want anyway for per-token revocation.
 */
function signRefreshToken(sub) {
  return jwt.sign({ sub, jti: crypto.randomUUID() }, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
  });
}
function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
}

module.exports = { signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken };
