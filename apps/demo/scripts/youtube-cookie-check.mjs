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
const YTDLP_SLEEP_REQUESTS = Math.max(0, Number(process.env.MMFR_YTDLP_SLEEP_REQUESTS || 1));
const YTDLP_SLEEP_INTERVAL = Math.max(0, Number(process.env.MMFR_YTDLP_SLEEP_INTERVAL || 1));
const YTDLP_MAX_SLEEP_INTERVAL = Math.max(YTDLP_SLEEP_INTERVAL, Number(process.env.MMFR_YTDLP_MAX_SLEEP_INTERVAL || 3));

function ytDlpBaseArgs() {
  const args = [
    "--js-runtimes",
    `node:${process.execPath}`,
    "--remote-components",
    "ejs:github"
  ];
  if (YTDLP_SLEEP_REQUESTS > 0) args.push("--sleep-requests", String(YTDLP_SLEEP_REQUESTS));
  if (YTDLP_SLEEP_INTERVAL > 0) args.push("--sleep-interval", String(YTDLP_SLEEP_INTERVAL));
  if (YTDLP_MAX_SLEEP_INTERVAL > 0) args.push("--max-sleep-interval", String(YTDLP_MAX_SLEEP_INTERVAL));
  return args;
}

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
  const metaResult = await run(YT_DLP, [
    ...ytDlpBaseArgs(),
    ...cookieArgs,
    "--dump-single-json",
    "--skip-download",
    "--no-playlist",
    TEST_URL
  ], { timeoutMs: 45000 });
  if (!metaResult.ok) {
    console.log("NG");
    console.log(metaResult.error.split("\n").slice(-3).join("\n"));
    return false;
  }
  let title = "readable";
  try {
    const json = JSON.parse(metaResult.stdout || "{}");
    title = json.title || title;
  } catch {}
  process.stdout.write(`metadata OK: ${title} / audio URL ... `);
  const audioResult = await run(YT_DLP, [
    ...ytDlpBaseArgs(),
    ...cookieArgs,
    "--no-playlist",
    "-f", "bestaudio/best",
    "--get-url",
    TEST_URL
  ], { timeoutMs: 45000 });
  if (audioResult.ok) {
    console.log("OK");
    return true;
  }
  console.log("NG");
  console.log(audioResult.error.split("\n").slice(-4).join("\n"));
  if (/rate-limited by YouTube|try again later/i.test(audioResult.error)) {
    console.log("This cookie/session is temporarily rate-limited for audio extraction.");
  }
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
  console.log("At least one method can read and access audio for this YouTube URL.");
} else {
  console.log("No method could access audio for this YouTube URL.");
  console.log("If metadata was OK but audio URL was NG, the session is likely rate-limited. Wait and retry, or export fresh cookies.txt from a different logged-in YouTube session.");
}
