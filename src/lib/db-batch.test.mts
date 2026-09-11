import assert from "node:assert/strict";
import test from "node:test";
import dbBatch from "./db-batch.ts";

const { chunkForDatabaseWrite } = dbBatch;

test("chunkForDatabaseWrite splits large writes into bounded requests", () => {
  const rows = Array.from({ length: 501 }, (_, index) => index);
  const chunks = chunkForDatabaseWrite(rows, 250);

  assert.deepEqual(chunks.map((chunk) => chunk.length), [250, 250, 1]);
  assert.deepEqual(chunks.flat(), rows);
});

test("chunkForDatabaseWrite returns no requests for an empty write", () => {
  assert.deepEqual(chunkForDatabaseWrite([], 250), []);
});

test("chunkForDatabaseWrite rejects invalid batch sizes", () => {
  assert.throws(() => chunkForDatabaseWrite([1], 0), /positive integer/i);
});
