import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from '@/components/icons';
import ArcadeRateLimitBanner from '@/components/ui/ArcadeRateLimitBanner';
import { LoginSchema, RegisterSchema } from '@/api/auth';
import { getServerErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/utils';
import { introDelay } from '@/lib/motion';
import GoogleSignInButton from './GoogleSignInButton';
import { AUTH_DIALOG_EVENT, SESSION_EXPIRED_EVENT } from './authEvents';
import { useAuth } from './useAuth';

type Step = 'email' | 'login' | 'register';

const fieldClass =
  'h-10 w-full rounded-[10px] border border-[var(--ws-line)] bg-transparent px-3.5 text-base sm:text-[14px] text-[var(--ws-ink)] placeholder:text-[var(--ws-ink-faint)] outline-none focus:border-[var(--ws-accent)] focus:ring-2 focus:ring-[var(--ws-accent-wash)]';

const LooksLikeEmail = LoginSchema.shape.email;

/**
 * The one place to log in or sign up: a card in the bottom right corner of whatever page the person is on, which
 * leaves the page usable behind it. Google first, then email, which asks for a password to log in, or a name and
 * password to create an account.
 */
export default function AuthDialog() {
  const queryClient = useQueryClient();
  const {
    isAuthenticated,
    login,
    isLoggingIn,
    loginError,
    googleLogin,
    isGoogleLoggingIn,
    googleLoginError,
    register,
    isRegistering,
    registerError,
  } = useAuth();
  const [open, setOpen] = useState(false);
  const [expired, setExpired] = useState(false);
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onOpen = () => {
      setExpired(false);
      setOpen(true);
    };
    const onExpired = () => {
      queryClient.setQueryData(['auth', 'me'], null);
      setExpired(true);
      setOpen(true);
    };
    window.addEventListener(AUTH_DIALOG_EVENT, onOpen);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => {
      window.removeEventListener(AUTH_DIALOG_EVENT, onOpen);
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
    };
  }, [queryClient]);

  // Closing starts it fresh for next time, keeping the email in case they come back to it
  const close = () => {
    setOpen(false);
    setStep('email');
    setPassword('');
    setFieldError(null);
  };

  const busy = isLoggingIn || isRegistering || isGoogleLoggingIn;
  const emailValid = LooksLikeEmail.safeParse(email.trim()).success;
  const serverError = step === 'register' ? registerError ?? loginError : step === 'login' ? loginError : googleLoginError;

  const continueWithEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailValid) return;
    setFieldError(null);
    setStep('login');
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const credentials = { email: email.trim(), password };
    const parsed = step === 'register' ? RegisterSchema.safeParse({ ...credentials, name: name.trim() }) : LoginSchema.safeParse(credentials);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Check your details');
      return;
    }
    setFieldError(null);
    try {
      if (step === 'register') await register({ ...credentials, name: name.trim() });
      await login(credentials);
      close();
    } catch {
      // Shown below from the mutation's error
    }
  };

  const switchStep = (next: Step) => {
    setStep(next);
    setFieldError(null);
    setTimeout(() => passwordRef.current?.focus(), 0);
  };

  return (
    <DialogPrimitive.Root open={open && !isAuthenticated} onOpenChange={(next) => (next ? setOpen(true) : close())} modal={false}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          // The page stays usable behind the card, so clicking it doesn't close the card; the close button and Esc do
          onInteractOutside={(e) => e.preventDefault()}
          className={cn(
            'font-ui fixed bottom-4 right-4 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[360px] overflow-y-auto rounded-2xl border border-[var(--ws-line)] bg-[var(--ws-dock)] px-7 pb-6 pt-9 text-[var(--ws-ink)] shadow-[var(--ws-shadow)] outline-none sm:bottom-6 sm:right-6',
            'duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-4'
          )}
        >
          <DialogPrimitive.Close
            aria-label="Close"
            className="ui-press absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-[9px] text-[var(--ws-ink-faint)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
          >
            <X size={16} />
          </DialogPrimitive.Close>
          <div className="flex flex-col items-center text-center">
            <span className="ui-in-pop flex items-center gap-[4px]" style={introDelay(60)} aria-hidden>
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-7 w-[9px] -skew-x-[18deg] rounded-[2px] bg-[var(--ws-accent)]" style={{ opacity: 1 - i * 0.22 }} />
              ))}
            </span>
            <DialogPrimitive.Title className="ui-in-up mt-5 text-[17px] font-semibold leading-snug" style={introDelay(110)}>
              {expired ? 'Log in to continue' : 'Log in or sign up for free'}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="ui-in-up mt-1.5 text-[14px] text-[var(--ws-ink-soft)]" style={introDelay(150)}>
              {expired ? 'Your session expired. Your research is saved.' : 'Save and sync your research'}
            </DialogPrimitive.Description>
          </div>

          <div className="ui-in-up mt-6 flex flex-col" style={introDelay(200)}>
            <ArcadeRateLimitBanner scope="auth:login" className="mb-3 w-full" />
            <ArcadeRateLimitBanner scope="auth:google" className="mb-3 w-full" />
            <ArcadeRateLimitBanner scope="auth:register" className="mb-3 w-full" />

            {step === 'email' ? (
              <>
                <GoogleSignInButton
                  text="continue_with"
                  divider="after"
                  disabled={busy}
                  onCredential={async (credential) => {
                    try {
                      await googleLogin(credential);
                      close();
                    } catch {
                      // Shown below from the mutation's error
                    }
                  }}
                />
                <form onSubmit={continueWithEmail} className="flex flex-col gap-2.5">
                  <label htmlFor="auth-email" className="sr-only">Email</label>
                  <input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    className={fieldClass}
                  />
                  <button
                    type="submit"
                    disabled={!emailValid}
                    className={cn(
                      'ui-press h-10 rounded-[10px] text-[14px] font-semibold',
                      emailValid
                        ? 'bg-[var(--ws-accent)] text-white hover:brightness-110 cursor-pointer'
                        : 'bg-[var(--ws-card-hover)] text-[var(--ws-ink-faint)] cursor-not-allowed'
                    )}
                  >
                    Continue with email
                  </button>
                </form>
              </>
            ) : (
              <form onSubmit={submitPassword} className="flex flex-col gap-2.5">
                <div className="flex h-10 items-center justify-between gap-2 rounded-[10px] bg-[var(--ws-card-hover)] pl-3.5 pr-1.5 text-[14px]">
                  <span className="truncate text-[var(--ws-ink-soft)]">{email.trim()}</span>
                  <button
                    type="button"
                    onClick={() => setStep('email')}
                    className="shrink-0 rounded-[7px] px-2 py-1 text-[12.5px] font-medium text-[var(--ws-accent-ink)] hover:bg-[var(--ws-card)] cursor-pointer"
                  >
                    Change
                  </button>
                </div>
                {step === 'register' && (
                  <>
                    <label htmlFor="auth-name" className="sr-only">Your name</label>
                    <input
                      id="auth-name"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      autoFocus
                      className={fieldClass}
                    />
                  </>
                )}
                <label htmlFor="auth-password" className="sr-only">Password</label>
                <input
                  id="auth-password"
                  ref={passwordRef}
                  type="password"
                  autoComplete={step === 'register' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={step === 'register' ? 'Create a password (8+ characters)' : 'Password'}
                  autoFocus={step === 'login'}
                  className={fieldClass}
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="ui-press h-10 rounded-[10px] bg-[var(--ws-accent)] text-[14px] font-semibold text-white hover:brightness-110 disabled:cursor-wait disabled:opacity-70 cursor-pointer"
                >
                  {step === 'register' ? (isRegistering || isLoggingIn ? 'Creating account…' : 'Create account') : isLoggingIn ? 'Logging in…' : 'Log in'}
                </button>
                <p className="pt-1 text-center text-[13px] text-[var(--ws-ink-soft)]">
                  {step === 'login' ? 'New to Scout? ' : 'Already have an account? '}
                  <button
                    type="button"
                    onClick={() => switchStep(step === 'login' ? 'register' : 'login')}
                    className="font-medium text-[var(--ws-accent-ink)] hover:underline cursor-pointer"
                  >
                    {step === 'login' ? 'Create an account' : 'Log in'}
                  </button>
                </p>
              </form>
            )}

            {(fieldError || serverError) && (
              <p role="alert" className="mt-3 text-center text-[13px] text-red-500">
                {fieldError ?? (getServerErrorMessage(serverError) || (step === 'register' ? 'Couldn’t create the account. The email may already be in use.' : 'That email and password don’t match.'))}
              </p>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
