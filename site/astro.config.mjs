// @ts-check
import { defineConfig } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import { rewriteRepoLinks } from "./src/lib/remark-repo-links.mjs";

// GitHub Pages project site: https://moneytosms.github.io/Pulse/
export default defineConfig({
  site: "https://moneytosms.github.io",
  base: "/Pulse",
  trailingSlash: "ignore",
  markdown: {
    processor: unified({ remarkPlugins: [rewriteRepoLinks] }),
    shikiConfig: {
      themes: { light: "github-light", dark: "github-dark-dimmed" },
      defaultColor: false,
    },
  },
});
