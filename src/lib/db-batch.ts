export function chunkForDatabaseWrite<T>(rows: readonly T[], batchSize = 250): T[][] {
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error("Database batch size must be a positive integer");
  }

  const chunks: T[][] = [];
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    chunks.push(rows.slice(offset, offset + batchSize));
  }
  return chunks;
}

export default { chunkForDatabaseWrite };
