<?php
declare(strict_types=1);

const UPSTREAM_ENDPOINT = 'https://musician-angeles-people-determination.trycloudflare.com/api/audio-analyze';
const MAX_REQUEST_BYTES = 32768;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond(int $status, array $payload): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
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
$curl = curl_init(UPSTREAM_ENDPOINT);
if ($curl === false) {
    respond(502, ['ok' => false, 'code' => 'UPSTREAM_UNAVAILABLE', 'error' => '解析サーバーへ接続できません。']);
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
    CURLOPT_TIMEOUT => 300,
    CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
]);

$response = curl_exec($curl);
$status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
$failed = $response === false;
curl_close($curl);

if ($failed || $status < 100) {
    respond(502, ['ok' => false, 'code' => 'UPSTREAM_UNAVAILABLE', 'error' => '解析サーバーへ接続できません。']);
}

http_response_code($status);
echo $response;
