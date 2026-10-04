import type { MapChange, MapEdge, MapFunction, MapNode, MapNodeDrop } from "./types";
import styles from "./calendar-map.module.css";

type Props = {
  node: MapNode;
  nodes: MapNode[];
  edges: MapEdge[];
  functions: MapFunction[];
  nodeDrop?: MapNodeDrop;
  run: (action: () => MapChange | void | Promise<MapChange | void>, pulseId?: string) => Promise<void>;
  selectEdge: (id: string) => void;
};

/** Every drag operation also has a labelled, keyboard-accessible control. */
export function MapInspector({ node, nodes, edges, functions, nodeDrop, run, selectEdge }: Props) {
  const connections = edges.filter((edge) => edge.from === node.id || edge.to === node.id);
  const boxes = nodes.filter((target) => target.box && nodeDrop?.accepts(node.id, target.id) === true);
  const members = node.box ? nodes.filter((source) => nodeDrop?.accepts(source.id, node.id) === true) : [];
  return (
    <>
      <div className={styles.inspectorText}>
        <span className={styles.eyebrow}>{node.variant === "function" ? "Function" : "Calendar details"}</span>
        <h3 className={styles.inspectorTitle}>{node.label}</h3>
        {node.caption ? <p className={styles.hint}>{node.caption}</p> : null}
        <ul className={styles.inspectorLines}>
          {node.details?.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      <div className={styles.inspectorActions}>
        {node.toggle ? (
          <button type="button" className={styles.button} onClick={() => void run(node.toggle!.run, node.id)}>
            {node.toggle.label}
          </button>
        ) : null}
        {node.actions?.map((action) => (
          <button key={action.id} type="button" className={styles.button} onClick={() => void run(action.run, node.id)}>
            {action.label}
          </button>
        ))}
        {functions
          .filter((fn) => fn.kind === "node" && fn.accepts(node.id) === true)
          .map((fn) =>
            fn.kind === "node" ? (
              <button key={fn.id} type="button" className={styles.button} onClick={() => void run(() => fn.apply(node.id), node.id)}>
                {fn.icon}
                {fn.actionLabel?.(node.id) ?? fn.label}
              </button>
            ) : null,
          )}
      </div>
      {functions.map((fn) => {
        if (fn.kind !== "link" || fn.acceptsFrom(node.id) !== true) return null;
        const targets = nodes.filter((target) => target.id !== node.id && fn.accepts(node.id, target.id) === true);
        if (!targets.length) return null;
        return (
          <label key={fn.id} className={styles.field}>
            {fn.label}
            <select
              value=""
              onChange={(event) => {
                const to = event.target.value;
                if (to) void run(() => fn.apply(node.id, to), to);
              }}
            >
              <option value="">Choose a calendar…</option>
              {targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.label}
                </option>
              ))}
            </select>
          </label>
        );
      })}
      {boxes.length ? (
        <label className={styles.field}>
          Apply to Merge
          <select
            value=""
            onChange={(event) => {
              const target = event.target.value;
              if (target && nodeDrop) void run(() => nodeDrop.apply(node.id, target), target);
            }}
          >
            <option value="">Choose a Merge function…</option>
            {boxes.map((box) => (
              <option key={box.id} value={box.id}>
                {box.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {members.length ? (
        <label className={styles.field}>
          Add imported calendar
          <select
            value=""
            onChange={(event) => {
              const source = event.target.value;
              if (source && nodeDrop) void run(() => nodeDrop.apply(source, node.id), node.id);
            }}
          >
            <option value="">Choose a calendar…</option>
            {members.map((source) => (
              <option key={source.id} value={source.id}>
                {source.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {node.box ? (
        <div className={styles.connectionList}>
          <span className={styles.eyebrow}>Sources · {node.box.rows.length}</span>
          {node.box.rows.length ? (
            node.box.rows.map((row) => (
              <div key={row.id} className={styles.member}>
                <strong>{row.label}</strong>
                {row.choice ? (
                  <label className={styles.field}>
                    {row.choice.label}
                    <select
                      aria-label={`Priority: ${row.label}`}
                      value={row.choice.value}
                      onChange={(event) => {
                        const choice = row.choice;
                        const value = event.target.value;
                        if (choice && value !== choice.value) void run(() => choice.onChange(value), node.id);
                      }}
                    >
                      {row.choice.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {row.remove ? (
                  <button type="button" className={styles.button} onClick={() => void run(row.remove!.run, node.id)}>
                    {row.remove.label} {row.label}
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            <p className={styles.hint}>{node.box.empty ?? "Add a calendar to get started."}</p>
          )}
        </div>
      ) : null}
      <div className={styles.connectionList}>
        <span className={styles.eyebrow}>Connections · {connections.length}</span>
        {connections.length ? (
          connections.map((edge) => {
            const other = nodes.find((entry) => entry.id === (edge.from === node.id ? edge.to : edge.from));
            return (
              <button type="button" key={edge.id} className={styles.connection} onClick={() => selectEdge(edge.id)}>
                <strong>{other?.label ?? "Calendar"}</strong>
                <span>
                  {edge.from === node.id ? "→ " : "← "}
                  {edge.via?.label ?? edge.label ?? "View connection"}
                </span>
              </button>
            );
          })
        ) : (
          <p className={styles.hint}>No connections yet.</p>
        )}
      </div>
    </>
  );
}
