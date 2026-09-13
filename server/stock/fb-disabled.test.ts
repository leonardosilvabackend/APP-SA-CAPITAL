import { expect, it, vi } from 'vitest';
vi.mock('../config', () => ({ config: { fbSyncEnabled: false } }));
vi.mock('../db/client', () => ({ getDatabase: vi.fn() }));
import { getDatabase } from '../db/client';
import { syncFbStock } from './fb-sync';
it('blocks disabled sync before touching database or external API', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  try {
    await expect(syncFbStock()).rejects.toMatchObject({ status: 403 });
    expect(getDatabase).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});
