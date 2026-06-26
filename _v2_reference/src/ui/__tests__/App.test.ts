import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import App from '../../App.svelte';
import { SHOP_TAB_IDS, TAB_NAMES } from '../../engine/config';

describe('App shop tabs', () => {
  it('renders at least one upgrade for each shop tab', async () => {
    const { getByRole, queryAllByRole } = render(App);

    for (const tabId of SHOP_TAB_IDS) {
      const tab = getByRole('tab', { name: TAB_NAMES[tabId] });
      await fireEvent.click(tab);

      const buttons = queryAllByRole('button', { name: /, Level/ });
      expect(buttons.length).toBeGreaterThan(0);
    }
  });
});
