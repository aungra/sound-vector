<?php
declare(strict_types=1);

const MAX_REQUEST_BYTES = 32768;
const UPSTREAM_FILE = __DIR__ . '/upstream-url.txt';
const CLOUD_UPSTREAM_FILE = __DIR__ . '/cloud-upstream-url.txt';
const REQUIRED_CLIENT_INFERENCE_REVISION = '2026-08-23-track-boundary-reranker-v97';
const UPSTREAM_TIMEOUT_SECONDS = 720;

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
    $endpoints = [];
    $cloudEndpoint = is_readable(CLOUD_UPSTREAM_FILE)
        ? trim((string) file_get_contents(CLOUD_UPSTREAM_FILE))
        : '';
    if (preg_match('#^https://[a-z0-9-]+\.hf\.space/api/audio-analyze$#D', $cloudEndpoint)) {
        $endpoints[] = $cloudEndpoint;
    }
    $endpoint = is_readable(UPSTREAM_FILE) ? trim((string) file_get_contents(UPSTREAM_FILE)) : '';
    if (preg_match('#^https://[a-z0-9-]+\.trycloudflare\.com/api/audio-analyze$#D', $endpoint)) {
        $endpoints[] = $endpoint;
    }
    return array_values(array_unique($endpoints));
}

function responseHasRichAnalysisParity(string $response, int $status): bool
{
    $decoded = successfulAnalysisPayload($response, $status);
    if ($decoded === null) {
        return false;
    }
    $top = $decoded['features']['embeddingGenrePrediction']['top'] ?? null;
    if (!is_array($top) || $top === []) {
        return false;
    }
    $features = is_array($decoded['features'] ?? null) ? $decoded['features'] : [];
    $prediction = is_array($features['embeddingGenrePrediction'] ?? null)
        ? $features['embeddingGenrePrediction']
        : [];
    $vocalEvidence = is_array($features['japaneseVocalEvidence'] ?? null)
        ? $features['japaneseVocalEvidence']
        : [];
    $externalTop = $prediction['unknownSourceConsensus']['top'] ?? null;
    return ($vocalEvidence['available'] ?? false) === true
        && is_array($externalTop)
        && $externalTop !== [];
}

function responseNeedsRichAnalysis(string $response, int $status): bool
{
    return !responseHasRichAnalysisParity($response, $status);
}

function successfulAnalysisPayload(string $response, int $status): ?array
{
    if ($status < 200 || $status >= 300) {
        return null;
    }
    $decoded = json_decode($response, true);
    return is_array($decoded) && ($decoded['ok'] ?? false) === true ? $decoded : null;
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
if (($payload['genreInferenceRevision'] ?? '') !== REQUIRED_CLIENT_INFERENCE_REVISION) {
    respond(409, [
        'ok' => false,
        'code' => 'CLIENT_UPDATE_REQUIRED',
        'error' => '解析画面が更新されています。ページを再読み込みして、もう一度解析してください。',
        'requiredRevision' => REQUIRED_CLIENT_INFERENCE_REVISION,
    ]);
}

set_time_limit(UPSTREAM_TIMEOUT_SECONDS);
$fallbackResponse = false;
$fallbackStatus = 0;
$nonParityResponse = false;
$selectedResponse = false;
$selectedStatus = 0;
foreach (upstreamEndpoints() as $endpoint) {
    $curl = curl_init($endpoint);
    if ($curl === false) {
        continue;
    }
    curl_setopt_array($curl, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Origin: https://aun-graphic.jp',
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT => UPSTREAM_TIMEOUT_SECONDS,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
    ]);
    $response = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $failed = $response === false;
    curl_close($curl);

    if ($failed || $status < 100) {
        continue;
    }
    $successful = successfulAnalysisPayload((string) $response, $status) !== null;
    $shouldTryRichAnalysis = responseNeedsRichAnalysis((string) $response, $status);
    if ($successful && $shouldTryRichAnalysis) {
        $nonParityResponse = $response;
    }
    if ($successful && !$shouldTryRichAnalysis) {
        $selectedResponse = $response;
        $selectedStatus = $status;
        break;
    }
    if ($fallbackResponse === false) {
        $fallbackResponse = $response;
        $fallbackStatus = $status;
    }
}

if ($selectedResponse !== false) {
    header('X-MMFR-Analysis-Tier: rich-parity');
    http_response_code($selectedStatus);
    echo $selectedResponse;
    exit;
}

if ($nonParityResponse !== false) {
    respond(503, [
        'ok' => false,
        'code' => 'RICH_ANALYSIS_REQUIRED',
        'error' => '高精度解析サービスが混雑または再接続中です。簡易解析の低信頼結果は表示せず、しばらく待って再試行します。',
    ]);
}

if ($fallbackResponse !== false) {
    http_response_code($fallbackStatus);
    echo $fallbackResponse;
    exit;
}

respond(502, ['ok' => false, 'code' => 'UPSTREAM_UNAVAILABLE', 'error' => '解析サーバーへ接続できません。']);
