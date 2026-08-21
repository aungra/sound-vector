<?php
declare(strict_types=1);

const MAX_REQUEST_BYTES = 32768;
const UPSTREAM_FILE = __DIR__ . '/upstream-url.txt';
const LOCAL_UPSTREAM = 'http://127.0.0.1:4196/api/audio-analyze';
const LOCAL_HEALTH = 'http://127.0.0.1:4196/health';
const SERVICE_ROOT = '/home/aungraphic02/musictee-audio-service';
const LOCAL_NODE = '/home/aungraphic02/bin/node';
const LOCAL_SERVER = SERVICE_ROOT . '/apps/demo/scripts/audio-analysis-server.mjs';
const LOCAL_MODEL = SERVICE_ROOT . '/genre-training/genre-model.json';
const LOCAL_YTDLP = '/home/aungraphic02/bin/yt-dlp';
const LOCAL_FFMPEG = '/home/aungraphic02/bin/ffmpeg';
const LOCAL_COOKIE = '/home/aungraphic02/.config/musictee/youtube-cookies.txt';
const LOCAL_LOCK = '/home/aungraphic02/.config/musictee/sakura-audio.lock';
const LOCAL_LOG = '/home/aungraphic02/logs/musictee-sakura-audio.log';
const LOCAL_CONFIDENCE_FLOOR = 12.0;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond(int $status, array $payload): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function upstreamEndpoints(): array
{
    $endpoints = [LOCAL_UPSTREAM];
    $endpoint = is_readable(UPSTREAM_FILE) ? trim((string) file_get_contents(UPSTREAM_FILE)) : '';
    if (preg_match('#^https://[a-z0-9-]+\.trycloudflare\.com/api/audio-analyze$#D', $endpoint)) {
        $endpoints[] = $endpoint;
    }
    return $endpoints;
}

function localServiceHealthy(): bool
{
    $curl = curl_init(LOCAL_HEALTH);
    if ($curl === false) {
        return false;
    }
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 1,
        CURLOPT_TIMEOUT => 2,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTP,
    ]);
    $response = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);
    return $response !== false && $status === 200;
}

function startLocalWorker()
{
    if (localServiceHealthy()) {
        return null;
    }
    foreach ([LOCAL_NODE, LOCAL_SERVER, LOCAL_MODEL, LOCAL_YTDLP, LOCAL_FFMPEG] as $required) {
        if (!is_readable($required)) {
            return null;
        }
    }
    $logDirectory = dirname(LOCAL_LOG);
    if (!is_dir($logDirectory)) {
        mkdir($logDirectory, 0700, true);
    }
    $environment = [
        'HOME' => '/home/aungraphic02',
        'PATH' => '/home/aungraphic02/bin:/usr/bin:/bin:/usr/local/bin',
        'YT_DLP_PATH' => LOCAL_YTDLP,
        'FFMPEG_PATH' => LOCAL_FFMPEG,
        'MMFR_AUDIO_HOST' => '127.0.0.1',
        'MMFR_AUDIO_PORT' => '4196',
        'MMFR_PUBLIC_MODE' => '1',
        'MMFR_ALLOWED_ORIGINS' => 'https://aun-graphic.jp,https://www.aun-graphic.jp',
        'MMFR_ANALYSIS_SECONDS' => '90',
        'MMFR_PUBLIC_MAX_CONCURRENT' => '1',
        'MMFR_PUBLIC_RATE_LIMIT' => '8',
        'MMFR_PUBLIC_RATE_WINDOW_MS' => '600000',
        'MMFR_YOUTUBE_DEADLINE_MS' => '270000',
        'MMFR_EMBEDDING_GENRE_ENABLED' => '0',
        'MMFR_EMBEDDING_GENRE_LIVE_ENABLED' => '0',
        'MMFR_LOCAL_GENRE_MODEL_PATH' => LOCAL_MODEL,
    ];
    if (is_readable(LOCAL_COOKIE)) {
        $environment['MMFR_YTDLP_COOKIES_FILE'] = LOCAL_COOKIE;
    }
    $descriptors = [
        0 => ['file', '/dev/null', 'r'],
        1 => ['file', LOCAL_LOG, 'a'],
        2 => ['file', LOCAL_LOG, 'a'],
    ];
    $process = proc_open(
        [LOCAL_NODE, '--max-old-space-size=128', LOCAL_SERVER],
        $descriptors,
        $pipes,
        SERVICE_ROOT,
        $environment,
        ['bypass_shell' => true]
    );
    if (!is_resource($process)) {
        return null;
    }
    for ($attempt = 0; $attempt < 20; $attempt++) {
        if (localServiceHealthy()) {
            return $process;
        }
        usleep(250000);
    }
    proc_terminate($process);
    proc_close($process);
    return null;
}

function stopLocalWorker($process): void
{
    if (!is_resource($process)) {
        return;
    }
    proc_terminate($process);
    proc_close($process);
}

function acquireLocalLock()
{
    $directory = dirname(LOCAL_LOCK);
    if (!is_dir($directory)) {
        mkdir($directory, 0700, true);
    }
    $lock = fopen(LOCAL_LOCK, 'c');
    if ($lock === false || !flock($lock, LOCK_EX)) {
        if (is_resource($lock)) {
            fclose($lock);
        }
        return null;
    }
    return $lock;
}

function releaseLocalLock($lock): void
{
    if (!is_resource($lock)) {
        return;
    }
    flock($lock, LOCK_UN);
    fclose($lock);
}

function localResponseNeedsRichAnalysis(string $response, int $status): bool
{
    if ($status < 200 || $status >= 300) {
        return true;
    }
    $decoded = json_decode($response, true);
    if (!is_array($decoded) || ($decoded['ok'] ?? false) !== true) {
        return true;
    }
    $top = $decoded['features']['embeddingGenrePrediction']['top'] ?? null;
    if (!is_array($top) || $top === []) {
        return true;
    }
    $topScore = 0.0;
    foreach ($top as $candidate) {
        if (is_array($candidate) && is_numeric($candidate['score'] ?? null)) {
            $topScore = max($topScore, (float) $candidate['score']);
        }
    }
    return $topScore < LOCAL_CONFIDENCE_FLOOR;
}

$method = $_SERVER['REQUEST_METHOD'] ?? '';
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = [
    'https://aun-graphic.jp',
    'https://www.aun-graphic.jp',
];

if ($method === 'OPTIONS') {
    if (in_array($origin, $allowedOrigins, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Methods: POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
        header('Vary: Origin');
    }
    respond(200, ['ok' => true]);
}

if ($method !== 'POST') {
    header('Allow: POST, OPTIONS');
    respond(405, ['ok' => false, 'code' => 'METHOD_NOT_ALLOWED', 'error' => 'POSTリクエストのみ利用できます。']);
}

if (!in_array($origin, $allowedOrigins, true)) {
    respond(403, ['ok' => false, 'code' => 'ORIGIN_NOT_ALLOWED', 'error' => 'このサイトからは解析APIを利用できません。']);
}

$contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($contentLength > MAX_REQUEST_BYTES) {
    respond(413, ['ok' => false, 'code' => 'REQUEST_TOO_LARGE', 'error' => 'リクエストが大きすぎます。']);
}

$body = file_get_contents('php://input');
if ($body === false || strlen($body) > MAX_REQUEST_BYTES) {
    respond(413, ['ok' => false, 'code' => 'REQUEST_TOO_LARGE', 'error' => 'リクエストが大きすぎます。']);
}

$payload = json_decode($body, true);
if (!is_array($payload) || ($payload['action'] ?? '') !== 'analyze-youtube') {
    respond(400, ['ok' => false, 'code' => 'INVALID_REQUEST', 'error' => 'YouTube解析リクエストが不正です。']);
}

set_time_limit(300);
$localLock = acquireLocalLock();
$localWorker = startLocalWorker();
$fallbackResponse = false;
$fallbackStatus = 0;
$selectedResponse = false;
$selectedStatus = 0;
foreach (upstreamEndpoints() as $endpoint) {
    $curl = curl_init($endpoint);
    if ($curl === false) {
        continue;
    }
    $isLocal = $endpoint === LOCAL_UPSTREAM;
    curl_setopt_array($curl, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Origin: https://aun-graphic.jp',
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => $isLocal ? 2 : 15,
        CURLOPT_TIMEOUT => 300,
        CURLOPT_PROTOCOLS => $isLocal ? CURLPROTO_HTTP : CURLPROTO_HTTPS,
    ]);
    $response = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $failed = $response === false;
    curl_close($curl);

    if ($failed || $status < 100) {
        continue;
    }
    $successful = $status >= 200 && $status < 300;
    $shouldTryRichAnalysis = $isLocal && localResponseNeedsRichAnalysis((string) $response, $status);
    if ($successful && !$shouldTryRichAnalysis) {
        $selectedResponse = $response;
        $selectedStatus = $status;
        break;
    }
    if ($isLocal || $fallbackResponse === false) {
        $fallbackResponse = $response;
        $fallbackStatus = $status;
    }
}
stopLocalWorker($localWorker);
releaseLocalLock($localLock);

if ($selectedResponse !== false) {
    http_response_code($selectedStatus);
    echo $selectedResponse;
    exit;
}

if ($fallbackResponse !== false) {
    http_response_code($fallbackStatus);
    echo $fallbackResponse;
    exit;
}

respond(502, ['ok' => false, 'code' => 'UPSTREAM_UNAVAILABLE', 'error' => '解析サーバーへ接続できません。']);
