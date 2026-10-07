"use client";

import { startTransition, useState, type InputHTMLAttributes } from "react";

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange">;

/** Search text is urgent; rendering the results can wait behind typing. */
export function SearchInput({ onQuery, ...props }: InputProps & { onQuery: (query: string) => void }) {
  const [text, setText] = useState("");
  return <input {...props} type="search" value={text} onChange={(event) => {
    const next = event.target.value;
    setText(next);
    startTransition(() => onQuery(next));
  }} />;
}

/** Apply autosaved rules on blur without recalculating the calendar per letter. */
export function CommitTextInput({ value, onCommit, onBlur, ...props }: InputProps & {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  const [previousValue, setPreviousValue] = useState(value);
  if (previousValue !== value) {
    setPreviousValue(value);
    setText(value);
  }
  return <input {...props} value={text} onChange={(event) => setText(event.target.value)} onBlur={(event) => {
    if (text !== value) onCommit(text);
    onBlur?.(event);
  }} />;
}
