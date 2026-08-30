import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";
import { exec } from "child_process";

/** @returns {import('vite').Plugin<unknown>} */
const coiPlugin = () => ({
  name: "coi-plugin",
  configureServer(server) {
    server.middlewares.use((_req, res, next) => {
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
      next();
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use((_req, res, next) => {
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
      next();
    });
  },
});

/** @type {() => Promise<string>} */
const getGitCommitHash = () =>
  new Promise((resolve, reject) => {
    exec("git describe --tags --always --abbrev=8 --dirty", (err, result) => {
      if (err) return resolve("WORKTREE");
      resolve(result.trim());
    });
  });

export default defineConfig(async ({ command }) => {
  const GIT_COMMIT_HASH = JSON.stringify(
    command === "serve" ? "DEV" : await getGitCommitHash(),
  );

  console.log(`GIT_COMMIT_HASH is ${GIT_COMMIT_HASH}`);

  return {
    server: {
      port: 5173,
    },
    define: {
      // XXX: is using env better?
      AGDA_PLAYGROUND_COMMIT: GIT_COMMIT_HASH,
    },
    optimizeDeps: {
      include: ["@runno/wasi", "jszip"],
    },
    clearScreen: false,
    plugins: [sveltekit(), coiPlugin()],
    build: {
      // bumped for TLA
      target: ["es2022", "edge89", "firefox89", "chrome89", "safari15"],
    },
    worker: {
      format: "es",
    },
    test: {
      globals: true,
      include: ["src/**/*.{test,spec}.{js,ts}"],
    },
  };
});
