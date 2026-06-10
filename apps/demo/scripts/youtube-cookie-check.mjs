import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const LOCAL_BIN = path.join(ROOT, ".tools", "bin");
const YT_DLP = process.env.YT_DLP_PATH || path.join(LOCAL_BIN, "yt-dlp-local");
const TEST_URL = process.env.MMFR_YTDLP_TEST_URL || "https://www.youtube.com/watch?v=Nt27aBceerI";
const DEFAULT_COOKIE_FILE = path.join(ROOT, "genre-training", "youtube-cookies.txt");
const COOKIE_FILE = process.env.MMFR_YTDLP_COOKIES_FILE || DEFAULT_COOKIE_FILE;
const COOKIE_BROWSERS = (process.env.MMFR_YTDLP_COOKIES_FROM_BROWSER
  || (process.platform === "darwin" ? "chrome,safari,firefox" : "chrome,firefox"))
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);

function run(command, args, options = {}) {
  return new Promise(resolve => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ ok: false, error: "timed out" });
    }, options.timeoutMs || 30000);
    child.stdout.on("data", chunk => stdout.push(chunk));
    child.stderr.on("data", chunk => stderr.push(chunk));
    child.on("error", error => {
      clearTimeout(timer);
      resolve({ ok: false, error: error.message });
    });
    child.on("close", code => {
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        stdout: Buffer.concat(stdout).toString("utf8"),
        error: Buffer.concat(stderr).toString("utf8").trim()
      });
    });
  });
}

async function check(label, cookieArgs) {
  process.stdout.write(`${label} ... `);
  const result = await run(YT_DLP, [
    "--js-runtimes",
    `node:${process.execPath}`,
    "--remote-components",
    "ejs:github",
    ...cookieArgs,
    "--dump-single-json",
    "--skip-download",
    "--no-playlist",
    TEST_URL
  ], { timeoutMs: 45000 });
  if (result.ok) {
    try {
      const json = JSON.parse(result.stdout || "{}");
      console.log(`OK: ${json.title || "readable"}`);
    } catch {
      console.log("OK");
    }
    return true;
  }
  console.log("NG");
  console.log(result.error.split("\n").slice(-3).join("\n"));
  return false;
}

console.log("YouTube Cookie Check");
console.log(`Test URL: ${TEST_URL}`);
console.log("");

let ok = false;
if (COOKIE_FILE) ok = await check(`cookies file ${COOKIE_FILE}`, ["--cookies", COOKIE_FILE]) || ok;
for (const browser of COOKIE_BROWSERS) {
  ok = await check(`browser ${browser}`, ["--cookies-from-browser", browser]) || ok;
}
ok = await check("no cookies", []) || ok;

console.log("");
if (ok) {
  console.log("At least one method can read this YouTube URL.");
} else {
  console.log("No method could read this YouTube URL.");
  console.log("Log in to YouTube on Chrome, or export cookies.txt and set MMFR_YTDLP_COOKIES_FILE.");
}
