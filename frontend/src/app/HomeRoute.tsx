import LandingPage from '@/features/landing/LandingPage';
import { useAuth } from '@/features/auth/useAuth';

/** `/`: the research home, for visitors and signed-in users alike. */
export default function HomeRoute() {
  const { isLoading } = useAuth();

  // Wait for a stored token to resolve so a signed-in user never sees the signed-out header flash first
  if (isLoading) return <div className="h-screen w-screen bg-[var(--ws-canvas)]" aria-busy />;
  return <LandingPage />;
}
