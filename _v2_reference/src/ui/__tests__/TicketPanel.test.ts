import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import TicketPanel from '../TicketPanel.svelte';
import type { Ticket } from '../../engine/types';

describe('TicketPanel', () => {
  it('shows P1 badge in red and SLA countdown', () => {
    const ticket: Ticket = {
      id: 't_1',
      type: 'p1',
      title: 'Service Down',
      sla: 12.5,
      maxSla: 15,
      rewardScaled: 500n,
      autoCloseTimer: 0,
      spawnTime: 0,
    };

    const { container, getByText } = render(TicketPanel, {
      props: { tickets: [ticket], onresolve: vi.fn() },
    });

    const badge = container.querySelector('.badge.p1');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe('P1');
    expect(getByText(/SLA 12\.5s/)).toBeInTheDocument();
  });
});
