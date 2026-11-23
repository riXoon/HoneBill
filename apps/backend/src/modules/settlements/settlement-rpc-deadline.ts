/** Bound read-only RPC work within one serverless invocation. */
export async function withinSettlementDeadline<T>(start: () => Promise<T>, deadlineAt?: number): Promise<T> {
  if (deadlineAt === undefined) return start();
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) throw new Error('Settlement RPC time budget exhausted.');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      start(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Settlement RPC time budget exhausted.')), remaining);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
