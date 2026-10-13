export type SaveQueue<T> = {
  (chatId: string, snapshot: T): Promise<void>;
  //runs after the current save, without cancelling a newer snapshot
  after(chatId: string, task: () => Promise<void>): Promise<void>;
};

//later snapshots must land last. an in-flight save of an earlier slice cannot overwrite them.
export function createSaveQueue<T>(save: (chatId: string, snapshot: T) => Promise<void>): SaveQueue<T> {
  const latest = new Map<string, number>();
  const tail = new Map<string, Promise<void>>();

  function settle(chatId: string, run: Promise<void>) {
    tail.set(
      chatId,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
  }

  const enqueue = ((chatId: string, snapshot: T) => {
    const seq = (latest.get(chatId) ?? 0) + 1;
    latest.set(chatId, seq);
    const previous = tail.get(chatId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(async () => {
      if (latest.get(chatId) !== seq) return;
      await save(chatId, snapshot);
    });
    settle(chatId, run);
    return run;
  }) as SaveQueue<T>;

  enqueue.after = (chatId, task) => {
    const previous = tail.get(chatId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(task);
    settle(chatId, run);
    return run;
  };

  return enqueue;
}
