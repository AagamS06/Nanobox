import { useId } from "react";
import "./ModeSwitch.css";

export interface ModeSwitchOption<T extends string> {
  value: T;
  label: string;
}

interface ModeSwitchProps<T extends string> {
  /** Accessible name for the group, e.g. "Widget type". */
  label: string;
  options: readonly [ModeSwitchOption<T>, ModeSwitchOption<T>];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Two-option segmented switch with a thumb that slides to the selected side.
 *
 * Built on real radio inputs (visually hidden, still focusable), so it gets
 * native keyboard behaviour for free: Tab focuses the group, arrow keys move
 * between options, and screen readers announce it as a radio group. The
 * slide animation is disabled under `prefers-reduced-motion` by the global
 * rule in themes/base.css.
 */
export function ModeSwitch<T extends string>({ label, options, value, onChange }: ModeSwitchProps<T>) {
  const name = useId();
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));

  return (
    <div className="mode-switch" role="radiogroup" aria-label={label} data-no-drag>
      <span
        className="mode-switch__thumb"
        aria-hidden="true"
        style={{ transform: `translateX(${selectedIndex * 100}%)` }}
      />
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <label key={option.value} className={`mode-switch__option ${checked ? "is-selected" : ""}`}>
            <input
              className="mode-switch__input"
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              onChange={() => onChange(option.value)}
            />
            <span className="mode-switch__label">{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}
