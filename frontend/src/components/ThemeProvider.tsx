"use client";

import type { ComponentProps } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// next-themes renders an inline <script> to set the theme before paint. React 19
// warns when that script is created client-side (e.g. the [locale] layout
// remounting on locale switch). The script only needs to run from the SSR HTML,
// so on the client mark it a data block, which React skips the warning for.
export function ThemeProvider(
  props: ComponentProps<typeof NextThemesProvider>,
) {
  return (
    <NextThemesProvider
      scriptProps={
        typeof window === "undefined" ? undefined : { type: "application/json" }
      }
      {...props}
    />
  );
}
