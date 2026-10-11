type Listener = () => void;
let listener: Listener | null = null;

export function onAuthExpired(fn: Listener): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

export function reportAuthExpired(): void {
  listener?.();
}
