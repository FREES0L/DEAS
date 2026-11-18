import { useEffect, useRef } from 'react';

/**
 * A number input the user can actually type into.
 *
 * While the typed text is an incomplete number (`0.` or `-`), `<input type="number">` reports an
 * empty value. A field driven by `value={numberState}` therefore erases the keystroke that starts
 * a decimal or a minus sign, which is how the LoRA weight boxes became impossible to set to 0.5.
 * This field owns its text while it is focused and is re-synced from the app only when the user is
 * not editing it, so drafts, presets and metadata applied from elsewhere still update the display.
 *
 * `text` is the canonical display (usually `String(value)`; an empty string means "unset").
 * `onCommit` runs for every complete number typed. With `reject` (default) a number outside
 * `min`/`max` is not committed and the box repairs itself on blur; call sites that clamp in their
 * own setter pass `reject={false}` and keep their previous behaviour.
 */
export interface NumberFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'type' | 'onChange'> {
  text: string;
  onCommit: (value: number) => void;
  reject?: boolean;
}

export function NumberField({ text, onCommit, reject = true, ...rest }: NumberFieldProps) {
  const ref = useRef<HTMLInputElement>(null);
  const canonical = useRef(text);
  canonical.current = text;
  // Update the box from app state (draft reuse, preset, metadata apply) - but never under the caret.
  useEffect(() => {
    const element = ref.current;
    if (element && document.activeElement !== element) element.value = text;
  }, [text]);
  const change = (event: React.ChangeEvent<HTMLInputElement>) => {
    const typed = event.currentTarget.value;
    if (typed === '') return;                     // clearing the box keeps the last accepted value
    const value = Number(typed);
    if (!Number.isFinite(value)) return;          // "0." and "-" arrive here as an empty value
    const min = rest.min === undefined ? -Infinity : Number(rest.min);
    const max = rest.max === undefined ? Infinity : Number(rest.max);
    if (reject && (value < min || value > max)) return;
    onCommit(value);
  };
  return (
    <input
      {...rest}
      ref={ref}
      type="number"
      defaultValue={text}
      onChange={event => change(event)}
      onBlur={event => { event.currentTarget.value = canonical.current; }}
    />
  );
}
