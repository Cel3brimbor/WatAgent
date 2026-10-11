//later snapshots must land last. an in-flight save of an earlier slice cannot overwrite them.
export function createSaveQueue<T>(save: (chatId: string, snapshot: T) => Promise<void>) {
  const latest = new Map<string, number>();
  const tail = new Map<string, Promise<void>>();

  return function enqueue(chatId: string, snapshot: T): Promise<void> {
    const seq = (latest.get(chatId) ?? 0) + 1;
    latest.set(chatId, seq);
    const previous = tail.get(chatId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(async () => {
      if (latest.get(chatId) !== seq) return;
      await save(chatId, snapshot);
    });
    tail.set(
      chatId,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  };
}
