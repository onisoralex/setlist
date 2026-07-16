"use client";

import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";

// Theme construction must live in this "use client" module, not app/layout.tsx: createTheme()
// returns an object containing functions (theme.spacing(), theme.transitions.create(), ...),
// and Server Components can only pass serializable props across the Server->Client boundary.
// Only `children` (a React node) crosses that boundary here.
//
// Colors/lengths below are var(--...) string literals pointing at this app's existing,
// settings-driven CSS custom properties (see app/layout.tsx's overrideStyle) -- MUI never
// reads `settings` itself, so a settings change only has to flow through the one existing
// CSS-var injection mechanism, not a second MUI-specific one.
const theme = createTheme({
  cssVariables: {
    // Follows prefers-color-scheme, same trigger app/globals.css already uses for dark mode.
    // This app has no manual light/dark toggle, so "media" is the only mode needed.
    colorSchemeSelector: "media",
  },
  // Plain `true` (use MUI's own default palette) leaves CssBaseline's global `body` rule
  // pointing at MUI's own --mui-palette-background-default, which silently wins the cascade
  // over this app's `body { background: var(--page-background) }` in globals.css (confirmed
  // by inspecting the injected stylesheet -- CssBaseline's rule loads after globals.css).
  // Pointing MUI's background.default at the same --page-background var, same string-literal
  // indirection as the --btn-* colors above, makes both rules resolve to one source of truth
  // instead of fixing this via specificity/!important.
  colorSchemes: {
    light: { palette: { background: { default: "var(--page-background)" } } },
    dark: { palette: { background: { default: "var(--page-background)" } } },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        // The installed @mui/material (9.x) removed the old compound variant+color classes
        // (containedPrimary/containedSecondary/containedError) that the spec's illustrative
        // snippet assumed -- Button's class taxonomy was rewritten (see e.g. the new
        // loading/loadingWrapper classes). ownerState is the current mechanism for the same
        // "contained + this color" targeting.
        root: ({ ownerState }) => ({
          fontSize: "var(--font-size-sm)",
          ...(ownerState.variant === "contained" &&
            ownerState.color === "primary" && {
              backgroundColor: "var(--btn-primary-background)",
              color: "var(--btn-primary-color)",
            }),
          ...(ownerState.variant === "contained" &&
            ownerState.color === "secondary" && {
              backgroundColor: "var(--btn-secondary-background)",
              color: "var(--btn-secondary-color)",
            }),
          ...(ownerState.variant === "contained" &&
            ownerState.color === "error" && {
              backgroundColor: "var(--btn-danger-background)",
              color: "var(--btn-danger-color)",
            }),
        }),
      },
    },
  },
});

const MuiThemeProvider = ({ children }: { children: React.ReactNode }) => (
  <AppRouterCacheProvider options={{ key: "css" }}>
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      {children}
    </ThemeProvider>
  </AppRouterCacheProvider>
);

export default MuiThemeProvider;
