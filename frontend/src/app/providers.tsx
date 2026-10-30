import { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/features/theme/ThemeProvider';
import RateLimitPopup from '@/components/ui/RateLimitPopup';
import { TooltipProvider } from '@/components/ui/tooltip';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

interface AppProvidersProps {
  children: ReactNode;
}

export default function AppProviders({ children }: AppProvidersProps) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        {/* App-wide so tooltips outside the home screen (e.g. the TopBar theme toggle) have a provider */}
        <TooltipProvider delayDuration={150}>
          {children}
          <RateLimitPopup />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

