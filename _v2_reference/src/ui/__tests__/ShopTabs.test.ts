/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ShopTabs from '../ShopTabs.svelte';

describe('ShopTabs', () => {
  it('updates active tab on click', async () => {
    const tabs = [
      { id: 'hardware', label: 'Hardware' },
      { id: 'cloud', label: 'Cloud' },
    ];
    const handler = vi.fn();
    const { getByRole } = render(ShopTabs, { props: { tabs, active: 'hardware', onselect: handler } });

    const cloudTab = getByRole('tab', { name: 'Cloud' });
    expect(cloudTab).toHaveAttribute('aria-selected', 'false');

    await fireEvent.click(cloudTab);
    expect(handler).toHaveBeenCalledWith('cloud');
  });
});
