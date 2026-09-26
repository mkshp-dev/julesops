'use strict';

// GitHub caps webhook payloads at 25 MB; nothing else the server accepts comes close to 1 MB.
const WEBHOOK_BODY_LIMIT = 25 * 1024 * 1024;
const DEFAULT_BODY_LIMIT = 1024 * 1024;

class BodyTooLargeError extends Error {
  constructor(limit) {
    super(`request body exceeds ${limit} bytes`);
    this.statusCode = 413;
  }
}

/**
 * Read a request body into a Buffer, rejecting with BodyTooLargeError (statusCode 413)
 * once it grows past `limit` bytes instead of buffering without bound.
 */
function readBody(req, limit = DEFAULT_BODY_LIMIT) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) {
      reject(new BodyTooLargeError(limit));
      req.resume();
      return;
    }

    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new BodyTooLargeError(limit));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = { readBody, BodyTooLargeError, WEBHOOK_BODY_LIMIT, DEFAULT_BODY_LIMIT };
