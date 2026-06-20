import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import EventLogPanel from '../EventLogPanel.svelte';
import { addEvent, createEventLog, type EventCategory } from '../../engine/eventLog';

describe('EventLogPanel', () => {
  it('appends an entry when addEvent is called', async () => {
    let log = createEventLog();
    log = addEvent(log, 'Test event', 'info', 'system');

    const { getByText } = render(EventLogPanel, {
      props: {
        entries: log.entries,
        filter: null,
        count: log.entries.length,
        categories: ['ticket', 'deploy'] as EventCategory[],
        onfilter: vi.fn(),
        onclear: vi.fn(),
      },
    });

    expect(getByText('Test event')).toBeInTheDocument();
    expect(getByText(/1\/1 events/)).toBeInTheDocument();
  });

  it('calls onclear when clear button is clicked', async () => {
    const onclear = vi.fn();
    const { getByRole } = render(EventLogPanel, {
      props: {
        entries: [],
        filter: null,
        count: 0,
        categories: [] as EventCategory[],
        onfilter: vi.fn(),
        onclear,
      },
    });

    await fireEvent.click(getByRole('button', { name: /Event Log leeren/ }));
    expect(onclear).toHaveBeenCalledTimes(1);
  });
});
