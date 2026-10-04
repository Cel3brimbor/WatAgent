import type { MapNode } from "./types";
import styles from "./calendar-map.module.css";

type Sync = NonNullable<MapNode["sync"]>;

/**drawn bar. a native progress element stays blank inside a transformed node.*/
export function SyncMeter({ sync, onNode = false }: { sync: Sync; onNode?: boolean }) {
  const open = sync.total == null;
  const max = Math.max(sync.total ?? 1, 1);
  return (
    <span
      className={onNode ? `${styles.meter} ${styles.nodeMeter}` : styles.meter}
      role="progressbar"
      aria-label={sync.label}
      aria-valuemin={0}
      aria-valuemax={open ? undefined : max}
      aria-valuenow={open ? undefined : sync.done}
      aria-valuetext={sync.label}
    >
      <span
        className={styles.meterFill}
        data-indeterminate={open || undefined}
        style={open ? undefined : { width: `${Math.min(100, Math.max(0, (sync.done / max) * 100))}%` }}
      />
    </span>
  );
}
