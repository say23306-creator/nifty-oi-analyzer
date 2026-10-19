// =============================================================================
// lib/utils/batch.ts — Chunk an array into batches + delay between them
// =============================================================================

/**
 * Split an array into chunks of `size`.
 */
export function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/**
 * Process an array in batches, with an optional delay between each batch.
 * Returns a flat array of all results.
 */
export async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  handler: (batch: T[], batchIndex: number) => Promise<R[]>,
  delayMs = 0
): Promise<R[]> {
  const batches = chunk(items, batchSize);
  const results: R[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batchResults = await handler(batches[i], i);
    results.push(...batchResults);

    // delay between batches (skip after last)
    if (delayMs > 0 && i < batches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
