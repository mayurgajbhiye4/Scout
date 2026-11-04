import { useTheme } from '@/features/theme';
import homeBackgroundDark from '@/assets/backgrounds/teal-curves-dark.jpg';
import homeBackgroundLight from '@/assets/backgrounds/teal-waves-light.jpg';

// Home backdrops: both photos are by Pawel Czerwinski, free under the Unsplash License
// (unsplash.com/photos/H8kzolaZjIM for dark, unsplash.com/photos/kj8_P9d5tpo for light).

/**
 * The abstract photo behind the home page, signed out and signed in, toned by a scrim so what sits on it stays
 * readable. Fills its positioned parent.
 */
export default function HomeBackdrop() {
  const { theme } = useTheme();
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <img
        src={theme === 'light' ? homeBackgroundLight : homeBackgroundDark}
        alt=""
        decoding="async"
        className="h-full w-full object-cover"
      />
      <div className="home-bg-scrim absolute inset-0" />
    </div>
  );
}
