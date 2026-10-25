/**
 * "Sign in with Google" button backed by Google Identity Services (GIS).
 *
 * GIS returns a signed ID token ("credential") which we hand to the backend at
 * POST /auth/google; the backend verifies it and issues our own JWT. The OAuth
 * Client ID comes from the backend (/auth/google/config), so the button simply
 * renders nothing when Google sign-in isn't configured.
 */
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authApi } from '@/api/auth';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleAccountsId {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    ux_mode?: 'popup' | 'redirect';
    context?: 'signin' | 'signup' | 'use';
  }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

let gisScriptPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gisScriptPromise) {
    gisScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        gisScriptPromise = null; // allow a retry on next mount
        reject(new Error('Failed to load Google Identity Services'));
      };
      document.head.appendChild(script);
    });
  }
  return gisScriptPromise;
}

interface GoogleSignInButtonProps {
  onCredential: (credential: string) => void;
  text?: 'signin_with' | 'signup_with' | 'continue_with';
  disabled?: boolean;
}

export default function GoogleSignInButton({ onCredential, text = 'continue_with', disabled }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState(false);

  // Latest callback without re-initialising GIS on every render
  const onCredentialRef = useRef(onCredential);
  useEffect(() => {
    onCredentialRef.current = onCredential;
  }, [onCredential]);

  const { data: config } = useQuery({
    queryKey: ['auth', 'google-config'],
    queryFn: authApi.googleConfig,
    staleTime: Infinity,
    retry: false,
  });

  const clientId = config?.enabled ? config.client_id : null;

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    loadGisScript()
      .then(() => {
        const container = containerRef.current;
        const gis = window.google?.accounts?.id;
        if (cancelled || !container || !gis) return;

        gis.initialize({
          client_id: clientId,
          callback: (response) => onCredentialRef.current(response.credential),
          ux_mode: 'popup',
          context: text === 'signup_with' ? 'signup' : 'signin',
        });
        container.innerHTML = '';
        gis.renderButton(container, {
          type: 'standard',
          theme: document.documentElement.classList.contains('dark') ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'rectangular',
          text,
          logo_alignment: 'left',
          width: container.offsetWidth || 336,
        });
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, text]);

  if (!clientId) return null;

  return (
    <div className="w-full">
      <div className="relative my-5 flex items-center">
        <div className="flex-grow border-t border-border" />
        <span className="mx-3 text-xs uppercase tracking-wide text-muted-foreground">or</span>
        <div className="flex-grow border-t border-border" />
      </div>
      {loadError ? (
        <p className="text-xs text-destructive text-center">
          Couldn't load Google sign-in. Check your connection or ad blocker.
        </p>
      ) : (
        <div
          ref={containerRef}
          aria-busy={disabled}
          className={`w-full flex justify-center min-h-[44px] ${disabled ? 'pointer-events-none opacity-60' : ''}`}
        />
      )}
    </div>
  );
}
