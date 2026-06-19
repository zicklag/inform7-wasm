import adapter from "@sveltejs/adapter-static";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      pages: "build",
      assets: "build",
      fallback: "index.html",
      precompress: false,
      strict: true,
    }),
    // Set base path for GitHub Pages deployment.
    // Defaults to "" for local dev; override via env in CI.
    paths: {
      base: process.env.BASE_PATH || "",
    },
  },
};

export default config;
