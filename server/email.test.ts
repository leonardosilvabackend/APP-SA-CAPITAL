import { afterEach, expect, it, vi } from 'vitest';
vi.mock('./config', () => ({ config: { emailEnabled: false, resendApiKey: 'fake', resendFromEmail: 'fake@example.invalid' } }));
import { sendPasswordResetEmail, sendStatusEmail } from './email';
afterEach(() => vi.unstubAllGlobals());
it('blocks both email paths even when credentials exist', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  await sendPasswordResetEmail('Test', 'test@example.invalid', 'https://example.invalid/private-token');
  await sendStatusEmail('Test', 'test@example.invalid', 'Test', 'Test');
  expect(fetch).not.toHaveBeenCalled();
});
