import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NumberField } from './NumberField';

afterEach(() => cleanup());
beforeEach(() => localStorage.clear());

// Like every real call site: the app owns the number and feeds it back as the canonical text.
const Box = ({ onCommit, text = '1', reject }: { onCommit: (n: number) => void; text?: string; reject?: boolean }) => {
  const [value, setValue] = useState(Number(text));
  return <NumberField aria-label="Strength of a.safetensors" text={String(value ?? Number(text))} min={-10} max={10} step={0.05} reject={reject}
    onCommit={n => { setValue(n); onCommit(n); }} />;
};
const box = (props: { onCommit: (n: number) => void; text?: string; reject?: boolean }) => <Box {...props} />;

it('keeps the in-progress decimal instead of rewriting or committing it as zero', () => {
  const commit = vi.fn();
  render(box({ onCommit: commit }));
  const field = screen.getByLabelText('Strength of a.safetensors') as HTMLInputElement;
  expect(field.value).toBe('1');
  field.focus();
  fireEvent.change(field, { target: { value: '0' } });
  expect(commit).toHaveBeenCalledWith(0);
  // An incomplete number ("0.") reaches the handler as an empty value in every browser.
  fireEvent.change(field, { target: { value: '' } });
  expect(field.value).toBe('');                       // not pushed back to "1" or "0" under the caret
  expect(commit).not.toHaveBeenCalledWith(1);
  fireEvent.change(field, { target: { value: '0.5' } });
  expect(commit).toHaveBeenLastCalledWith(0.5);
});

it('types a minus sign, commits decimals exactly and repairs out-of-range text on blur', () => {
  const commit = vi.fn();
  render(box({ onCommit: commit }));
  const field = screen.getByLabelText('Strength of a.safetensors') as HTMLInputElement;
  field.focus();
  fireEvent.change(field, { target: { value: '-' } });      // arrives empty, like "0."
  expect(commit).not.toHaveBeenCalled();
  fireEvent.change(field, { target: { value: '-0.25' } });
  expect(commit).toHaveBeenLastCalledWith(-0.25);
  fireEvent.blur(field);
  expect(field.value).toBe('-0.25');
  field.focus();
  fireEvent.change(field, { target: { value: '50' } });     // outside min/max
  expect(commit).not.toHaveBeenCalledWith(50);
  fireEvent.blur(field);
  expect(field.value).toBe('-0.25');                        // repaired, never stored
});

it('leaves range handling to the setter when reject is off, so clamping fields keep working', () => {
  const commit = vi.fn();
  render(<NumberField aria-label="Seconds" text="4" min={0.5} max={15} step={0.5} reject={false} onCommit={commit} />);
  const field = screen.getByLabelText('Seconds') as HTMLInputElement;
  fireEvent.change(field, { target: { value: '20' } });
  expect(commit).toHaveBeenCalledWith(20);
});

it('shows an unset field as empty and re-syncs a field the user is not editing', () => {
  const Host = ({ next }: { next: number | undefined }) => {
    const [value, setValue] = useState(next);
    return <><NumberField aria-label="Reserve VRAM" text={value === undefined ? '' : String(value)} min={0} max={128} step={0.5} placeholder="Default" onCommit={n => setValue(n)} />
      <button type="button" onClick={() => setValue(12)}>apply from elsewhere</button></>;
  };
  render(<Host next={undefined} />);
  const field = screen.getByLabelText('Reserve VRAM') as HTMLInputElement;
  expect(field.value).toBe('');
  expect(field.getAttribute('placeholder')).toBe('Default');
  fireEvent.change(field, { target: { value: '6' } });
  expect(field.value).toBe('6');
  fireEvent.click(screen.getByRole('button', { name: 'apply from elsewhere' }));
  expect(field.value).toBe('12');
});
