// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { SegmentedControl } from './SegmentedControl';

const SIZES = [
  { value: 'A4', label: 'A4' },
  { value: 'A3', label: 'A3' },
  { value: 'Letter', label: 'Letter' },
] as const;

function Harness() {
  const [size, setSize] = useState<(typeof SIZES)[number]['value']>('A4');
  return (
    <>
      <SegmentedControl label="Page size" options={SIZES} value={size} onChange={setSize} />
      <output>{size}</output>
    </>
  );
}

describe('SegmentedControl', () => {
  it('is a labelled radio group with the selected option checked', () => {
    render(<Harness />);
    const group = screen.getByRole('radiogroup', { name: 'Page size' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'A4' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'A3' })).toHaveAttribute('aria-checked', 'false');
    // 고른 칸만 Tab으로 들어간다
    expect(screen.getByRole('radio', { name: 'A4' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Letter' })).toHaveAttribute('tabindex', '-1');
  });

  it('selects an option on click', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('radio', { name: 'Letter' }));
    expect(screen.getByRole('radio', { name: 'Letter' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Letter');
  });

  it('moves and selects with the arrow keys, wrapping at the ends', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.tab();
    expect(screen.getByRole('radio', { name: 'A4' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'A3' })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('A3');
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Letter' })).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{Home}');
    expect(screen.getByRole('status')).toHaveTextContent('A4');
  });
});
