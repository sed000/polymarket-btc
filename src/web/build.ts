import { existsSync, mkdirSync } from "fs";
import { join } from "path";

const ROOT_DIR = process.cwd();
const WEB_SRC_DIR = join(ROOT_DIR, "src", "web");
const WEB_DIST_DIR = join(ROOT_DIR, "dist", "web");

export async function buildWebAssets(): Promise<void> {
  if (!existsSync(WEB_DIST_DIR)) {
    mkdirSync(WEB_DIST_DIR, { recursive: true });
  }

  const result = await Bun.build({
    entrypoints: [join(WEB_SRC_DIR, "client.tsx")],
    outdir: WEB_DIST_DIR,
    target: "browser",
    minify: false,
    sourcemap: "external",
  });

  if (!result.success) {
    const messages = result.logs.map(log => log.message).join("\n");
    throw new Error(`Web build failed:\n${messages}`);
  }

  const htmlSource = Bun.file(join(WEB_SRC_DIR, "index.html"));
  const cssSource = Bun.file(join(WEB_SRC_DIR, "styles.css"));
  await Bun.write(join(WEB_DIST_DIR, "index.html"), htmlSource);
  await Bun.write(join(WEB_DIST_DIR, "styles.css"), cssSource);
}

if (import.meta.main) {
  await buildWebAssets();
  console.log("Web assets built in dist/web.");
}
