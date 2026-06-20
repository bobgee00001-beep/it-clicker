import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import UpgradeList from '../UpgradeList.svelte';

describe('UpgradeList', () => {
  it('renders disabled state when not affordable', () => {
    const upgrade = {
      id: 'hardware_server',
      name: 'Server Rack',
      flavor: 'mehr Cycles',
      costScaled: 5000n,
      maxLevel: 1,
      target: { kind: 'generator', genId: 'server' },
      factorNum: 2n,
      factorDen: 1n,
    } as const;

    const { getByRole } = render(UpgradeList, {
      props: {
        upgrades: [upgrade],
        owned: {},
        affordable: { hardware_server: false },
        cyclesScaled: 100n,
        onbuy: vi.fn(),
      },
    });

    const button = getByRole('button', { name: /Server Rack/ });
    expect(button).toBeDisabled();
  });

  it('renders installed state at max level', () => {
    const upgrade = {
      id: 'hardware_server',
      name: 'Server Rack',
      flavor: 'mehr Cycles',
      costScaled: 5000n,
      maxLevel: 1,
      target: { kind: 'generator', genId: 'server' },
      factorNum: 2n,
      factorDen: 1n,
    } as const;

    const { getByRole } = render(UpgradeList, {
      props: {
        upgrades: [upgrade],
        owned: { hardware_server: 1 },
        affordable: { hardware_server: true },
        cyclesScaled: 10000n,
        onbuy: vi.fn(),
      },
    });

    const button = getByRole('button', { name: /Server Rack/ });
    expect(button).toBeDisabled();
    expect(button.textContent).toContain('installiert');
  });
});
