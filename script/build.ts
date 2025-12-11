import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import { execSync } from "child_process";

// Verify Python dependencies (yt-dlp is installed via pyproject.toml)
console.log("Verifying Python dependencies...");
try {
  const ytdlpVersion = execSync("python3 -m yt_dlp --version", { encoding: "utf-8" }).trim();
  console.log(`yt-dlp available: ${ytdlpVersion}`);
} catch (err) {
  console.warn("yt-dlp not found via pyproject.toml, attempting pip install...");
  try {
    execSync("pip install yt-dlp", { stdio: "inherit" });
    console.log("yt-dlp installed via pip");
  } catch (pipErr) {
    console.error("Failed to install yt-dlp:", pipErr);
  }
}

// Verify ffmpeg
try {
  execSync("ffmpeg -version", { stdio: "pipe" });
  console.log("ffmpeg available");
} catch (err) {
  console.warn("ffmpeg not found - audio conversion may fail");
}

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
