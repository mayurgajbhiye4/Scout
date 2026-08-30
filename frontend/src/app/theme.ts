/**
 * MUI theme — Pure Dark Mode aesthetic with Pitch Black & Matte Dark surfaces.
 */
import { createTheme, alpha } from '@mui/material/styles';

// ── Palette tokens ──────────────────────────────────────────────────────────
const BRAND = {
  primary: '#FFFFFF',       // Linear Crisp White
  primaryLight: '#FFFFFF',  // Pure White
  primaryDark: '#E4E4E7',   // Bright Zinc-200
  secondary: '#10B981',     // Emerald-500 — success / evidence-verified
  warning: '#F59E0B',       // Amber-500 — warm indicator
  error: '#EF4444',         // Red-500 — error / alert
  info: '#38BDF8',          // Sky-400 — docs / web info
};

const SURFACE = {
  bg: '#09090B',            // Pitch Black root background
  paper: '#111114',         // Elevated matte obsidian cards
  paperElevated: '#17171C', // Elevated surfaces (dialogs, popovers, menus)
  subtle: '#1C1C22',        // Secondary subtle container / pill background
  border: '#27272A',        // Zinc-800 — crisp partition borders
  borderHover: '#3F3F46',   // Zinc-700 on hover
};

const TEXT = {
  primary: '#F4F4F5',       // Zinc-100 — High contrast crisp white
  secondary: '#A1A1AA',     // Zinc-400 — Muted secondary text
  disabled: '#71717A',      // Zinc-500 — Disabled / subtle text
};

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: BRAND.primary,
      light: BRAND.primaryLight,
      dark: BRAND.primaryDark,
      contrastText: '#09090B',
    },
    secondary: {
      main: BRAND.secondary,
      contrastText: '#FFFFFF',
    },
    warning: {
      main: BRAND.warning,
    },
    error: {
      main: BRAND.error,
    },
    info: {
      main: BRAND.info,
    },
    background: {
      default: SURFACE.bg,
      paper: SURFACE.paper,
    },
    text: {
      primary: TEXT.primary,
      secondary: TEXT.secondary,
      disabled: TEXT.disabled,
    },
    divider: SURFACE.border,
    action: {
      selected: alpha(BRAND.primary, 0.2),
      hover: alpha('#FFFFFF', 0.05),
    },
  },

  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontWeight: 700, fontSize: '2rem', letterSpacing: '-0.02em', color: TEXT.primary },
    h2: { fontWeight: 600, fontSize: '1.5rem', letterSpacing: '-0.01em', color: TEXT.primary },
    h3: { fontWeight: 600, fontSize: '1.25rem', color: TEXT.primary },
    h4: { fontWeight: 600, fontSize: '1.125rem', color: TEXT.primary },
    h5: { fontWeight: 500, fontSize: '1rem', color: TEXT.primary },
    h6: { fontWeight: 500, fontSize: '0.875rem', color: TEXT.primary },
    body1: { fontSize: '0.9375rem', lineHeight: 1.6, color: TEXT.primary },
    body2: { fontSize: '0.8125rem', lineHeight: 1.5, color: TEXT.secondary },
    caption: { fontSize: '0.75rem', color: TEXT.secondary },
    button: { textTransform: 'none', fontWeight: 600 },
    overline: { textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.6875rem', fontWeight: 600, color: TEXT.disabled },
  },

  shape: {
    borderRadius: 8,
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: SURFACE.bg,
          color: TEXT.primary,
          scrollbarColor: `${SURFACE.border} ${SURFACE.bg}`,
          '&::-webkit-scrollbar': { width: 8, height: 8 },
          '&::-webkit-scrollbar-track': { background: SURFACE.bg },
          '&::-webkit-scrollbar-thumb': {
            background: SURFACE.border,
            borderRadius: 4,
            '&:hover': {
              background: SURFACE.borderHover,
            },
          },
        },
        'code, pre': {
          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 8, padding: '8px 20px' },
        contained: {
          color: '#FFFFFF',
          backgroundColor: BRAND.primary,
          '&:hover': {
            backgroundColor: BRAND.primaryDark,
            boxShadow: `0 0 0 3px ${alpha(BRAND.primary, 0.3)}`,
          },
        },
        outlined: {
          borderColor: SURFACE.border,
          color: TEXT.primary,
          '&:hover': {
            borderColor: BRAND.primaryLight,
            backgroundColor: alpha(BRAND.primary, 0.1),
          },
        },
        text: {
          color: TEXT.secondary,
          '&:hover': {
            color: TEXT.primary,
            backgroundColor: alpha('#FFFFFF', 0.05),
          },
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: SURFACE.paper,
          border: `1px solid ${SURFACE.border}`,
          color: TEXT.primary,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: SURFACE.paper,
          border: `1px solid ${SURFACE.border}`,
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease',
          '&:hover': {
            borderColor: SURFACE.borderHover,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
          },
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#0B0B0E',
          borderRight: `1px solid ${SURFACE.border}`,
          backgroundImage: 'none',
        },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundColor: '#0B0B0E',
          color: TEXT.primary,
          borderBottom: `1px solid ${SURFACE.border}`,
          backgroundImage: 'none',
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: `${SURFACE.paperElevated} !important`,
          border: `1px solid ${SURFACE.border}`,
          backgroundImage: 'none',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.7) !important',
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          color: TEXT.primary,
          fontSize: '0.875rem',
          '&:hover': {
            backgroundColor: alpha('#FFFFFF', 0.07),
          },
          '&.Mui-selected': {
            backgroundColor: alpha(BRAND.primary, 0.18),
            '&:hover': {
              backgroundColor: alpha(BRAND.primary, 0.25),
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 500,
          fontSize: '0.75rem',
          backgroundColor: SURFACE.subtle,
          borderColor: SURFACE.border,
          color: TEXT.primary,
        },
        outlined: {
          borderColor: SURFACE.border,
          backgroundColor: 'transparent',
        },
      },
    },
    MuiTextField: {
      defaultProps: { variant: 'outlined', size: 'small' },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: '#0E0E12',
            color: TEXT.primary,
            '& fieldset': { borderColor: SURFACE.border },
            '&:hover fieldset': { borderColor: SURFACE.borderHover },
            '&.Mui-focused fieldset': { borderColor: BRAND.primary },
          },
          '& .MuiInputLabel-root': {
            color: TEXT.secondary,
            '&.Mui-focused': { color: BRAND.primaryLight },
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: SURFACE.paperElevated,
          backgroundImage: 'none',
          border: `1px solid ${SURFACE.border}`,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.85)',
          color: TEXT.primary,
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: '#1E1E24',
          color: '#FFFFFF',
          fontSize: '0.75rem',
          borderRadius: 6,
          border: `1px solid ${SURFACE.borderHover}`,
          boxShadow: '0 8px 16px rgba(0, 0, 0, 0.6)',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          minHeight: 44,
          color: TEXT.secondary,
          '&.Mui-selected': {
            color: BRAND.primaryLight,
          },
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 4, height: 6, backgroundColor: alpha(BRAND.primary, 0.15) },
      },
    },
    MuiSkeleton: {
      styleOverrides: {
        root: { backgroundColor: '#1C1C22' },
      },
    },
  },
});

export default theme;
