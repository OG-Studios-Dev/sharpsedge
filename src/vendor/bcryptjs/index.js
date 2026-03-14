const crypto = require("crypto");

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64");
}

function normalizeRounds(rounds) {
  const parsed = Number(rounds);
  if (!Number.isFinite(parsed)) {
    return 12;
  }

  return Math.min(16, Math.max(10, Math.round(parsed)));
}

function scryptCost(rounds) {
  return 1 << normalizeRounds(rounds);
}

function hashSync(password, rounds = 12) {
  const normalizedRounds = normalizeRounds(rounds);
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64, {
    N: scryptCost(normalizedRounds),
    r: 8,
    p: 1,
    maxmem: 128 * 1024 * 1024,
  });

  return `$scrypt$${normalizedRounds}$${toBase64Url(salt)}$${toBase64Url(derived)}`;
}

async function hash(password, rounds = 12) {
  return hashSync(password, rounds);
}

function compareSync(password, storedHash) {
  if (typeof storedHash !== "string" || !storedHash.startsWith("$scrypt$")) {
    return false;
  }

  const [, , rounds, saltValue, derivedValue] = storedHash.split("$");
  if (!rounds || !saltValue || !derivedValue) {
    return false;
  }

  const salt = fromBase64Url(saltValue);
  const expected = fromBase64Url(derivedValue);
  const derived = crypto.scryptSync(password, salt, expected.length, {
    N: scryptCost(rounds),
    r: 8,
    p: 1,
    maxmem: 128 * 1024 * 1024,
  });

  return crypto.timingSafeEqual(derived, expected);
}

async function compare(password, storedHash) {
  return compareSync(password, storedHash);
}

module.exports = {
  hashSync,
  hash,
  compareSync,
  compare,
};
