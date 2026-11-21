import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AuthDialog from '../AuthDialog';
import { openAuthDialog } from '../authEvents';

const login = vi.fn();
const register = vi.fn();

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    login,
    isLoggingIn: false,
    loginError: null,
    googleLogin: vi.fn(),
    isGoogleLoggingIn: false,
    googleLoginError: null,
    register,
    isRegistering: false,
    registerError: null,
  }),
}));

// Google sign in needs the backend's config and Google's script; the dialog's own flow is what's under test
vi.mock('../GoogleSignInButton', () => ({ default: () => null }));

function renderDialog() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthDialog />
    </QueryClientProvider>
  );
  act(() => openAuthDialog());
}

describe('AuthDialog', () => {
  beforeEach(() => {
    login.mockReset().mockResolvedValue({ access_token: 't' });
    register.mockReset().mockResolvedValue({});
  });

  it('opens on request and asks for an email first', () => {
    renderDialog();
    expect(screen.getByRole('heading', { name: /log in or sign up/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue with email/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'ada@example.com' } });
    expect(screen.getByRole('button', { name: /continue with email/i })).toBeEnabled();
  });

  it('returns focus to the control that opened it when closed', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <button type="button" onClick={openAuthDialog}>Start researching</button>
        <AuthDialog />
      </QueryClientProvider>
    );
    const opener = screen.getByRole('button', { name: 'Start researching' });
    opener.focus();
    act(() => opener.click());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it('logs in with the email and password', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'ada@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /continue with email/i }));
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: /^log in$/i }));
    await waitFor(() => expect(login).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'secret' }));
    expect(register).not.toHaveBeenCalled();
  });

  it('creates an account, then logs in with it', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'ada@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /continue with email/i }));
    fireEvent.click(screen.getByRole('button', { name: /create an account/i }));
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Ada Lovelace' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'longenough' } });
    fireEvent.click(screen.getByRole('button', { name: /^create account$/i }));
    await waitFor(() => expect(login).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'longenough' }));
    expect(register).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'longenough', name: 'Ada Lovelace' });
  });
});
