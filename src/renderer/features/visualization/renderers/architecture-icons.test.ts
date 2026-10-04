import { describe, expect, it } from 'vitest';
import { ARCHITECTURE_ICONS } from '../../../../shared/visualization/infographic-spec';
import { ARCHITECTURE_ICON } from './architecture-icons';

describe('ARCHITECTURE_ICON', () => {
  it('has a lucide icon for every icon kind the spec allows, plus the generic box', () => {
    for (const icon of [...ARCHITECTURE_ICONS, 'generic' as const]) {
      expect(ARCHITECTURE_ICON[icon], icon).toBeDefined();
    }
    expect(Object.keys(ARCHITECTURE_ICON)).toHaveLength(ARCHITECTURE_ICONS.length + 1);
  });
});
