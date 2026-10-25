import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GoogleSignInButton from '../GoogleSignInButton';
import { authApi } from '@/api/auth';

vi.mock('@/api/auth', () => ({
  authApi: { googleConfig: vi.fn() },
}));

function renderButton(onCredential = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <GoogleSignInButton onCredential={onCredential} />
    </QueryClientProvider>
  );
}

describe('GoogleSignInButton', () => {
  beforeEach(() => {
    const initialize = vi.fn();
    const renderGoogleButton = vi.fn();
    window.google = { accounts: { id: { initialize, renderButton: renderGoogleButton } } };
  });

  afterEach(() => {
    delete window.google;
    vi.clearAllMocks();
  });

  it('renders nothing when Google sign-in is not configured', async () => {
    vi.mocked(authApi.googleConfig).mockResolvedValue({ enabled: false, client_id: null });
    const { container } = renderButton();
    await waitFor(() => expect(authApi.googleConfig).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('initializes GIS and forwards the credential', async () => {
    vi.mocked(authApi.googleConfig).mockResolvedValue({ enabled: true, client_id: 'abc.apps.googleusercontent.com' });
    const onCredential = vi.fn();
    renderButton(onCredential);

    expect(await screen.findByText(/or/i)).toBeInTheDocument();
    const gis = window.google!.accounts.id;
    await waitFor(() => expect(gis.renderButton).toHaveBeenCalled());

    const [config] = vi.mocked(gis.initialize).mock.calls[0]!;
    expect(config.client_id).toBe('abc.apps.googleusercontent.com');
    config.callback({ credential: 'id-token' });
    expect(onCredential).toHaveBeenCalledWith('id-token');
  });
});
