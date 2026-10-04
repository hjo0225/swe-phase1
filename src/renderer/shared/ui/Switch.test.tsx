// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Switch } from './Switch';

function Harness() {
  const [on, setOn] = useState(true);
  return <Switch label="Fit to one page" hint={on ? 'Shrinks the note to one page' : 'Long notes continue on more pages'} checked={on} onChange={setOn} />;
}

describe('Switch', () => {
  it('is a switch named by its label and described by its hint', () => {
    render(<Harness />);
    const toggle = screen.getByRole('switch', { name: 'Fit to one page' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle).toHaveAccessibleDescription('Shrinks the note to one page');
  });

  it('toggles from the switch and from its label text', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const toggle = screen.getByRole('switch', { name: 'Fit to one page' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveAccessibleDescription('Long notes continue on more pages');
    await user.click(screen.getByText('Fit to one page'));
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });
});
