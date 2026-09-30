"use client";

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
};

//native checkbox underneath so labels, forms, and assistive tech keep working
export function Switch({ checked, onChange, id, disabled, ...aria }: Props) {
  return (
    <span className="switch">
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="switch-input"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        {...aria}
      />
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
    </span>
  );
}
