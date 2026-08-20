<?php
declare(strict_types=1);

const MAX_REQUEST_BYTES = 16384;
const DATA_ROOT = '/home/aungraphic02/.config/musictee/genre-feedback';
const STATE_FILE = DATA_ROOT . '/state.json';
const SECRET_FILE = DATA_ROOT . '/secret.key';
const LOCK_FILE = DATA_ROOT . '/state.lock';
const HOLDOUT_FILE = '/home/aungraphic02/musictee-audio-service/deploy/aun-graphic-sound-form/genre-feedback-holdout.json';
const COOKIE_NAME = 'mmfr_feedback_session';
const FEATURE_VERSION = 'adaptive-boundary-v1';
const MODEL_VERSION = 'community-boundary-v1';
const MIN_INTERACTION_MS = 1500;
const MIN_UNIQUE_VOTERS = 3;
const MIN_CONSENSUS_SHARE = 0.75;
const CLUSTER_DISTANCE = 0.08;
const APPLY_DISTANCE = 0.12;
const MAX_DAILY_NETWORK_SUBMISSIONS = 60;
const MAX_TEN_MINUTE_NETWORK_SUBMISSIONS = 12;
const MAX_TOP1_REGRESSION_POINTS = 1.0;

const GENRES = [
    'アンビエント', 'ドローン', 'ノイズミュージック', '電子音楽', 'テクノ', 'ハウス', 'ディープ・ハウス', 'トランス',
    'ドラムンベース', 'ダブステップ', 'チップチューン', 'ヒップホップ', 'トラップ', 'レゲエ', 'ダブ', 'ブルース',
    'ロック', 'パンク', 'ハードコア', 'メタル', 'ジャズ', 'ファンク', 'ソウルミュージック', 'ディスコ',
    'シティ・ポップ', 'J-POP', 'アニメソング', 'クラシック音楽', 'オペラ', 'フォーク', 'ラテン', 'ワールドミュージック',
];

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

function respond(int $status, array $payload): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function ensureDataRoot(): void
{
    if (!is_dir(DATA_ROOT) && !mkdir(DATA_ROOT, 0700, true) && !is_dir(DATA_ROOT)) {
        respond(503, ['ok' => false, 'code' => 'STORAGE_UNAVAILABLE', 'error' => 'フィードバック保存領域を準備できません。']);
    }
}

function secretKey(): string
{
    ensureDataRoot();
    if (is_readable(SECRET_FILE)) {
        $secret = trim((string) file_get_contents(SECRET_FILE));
        if (strlen($secret) >= 32) {
            return $secret;
        }
    }
    $secret = bin2hex(random_bytes(32));
    if (file_put_contents(SECRET_FILE, $secret, LOCK_EX) === false) {
        respond(503, ['ok' => false, 'code' => 'STORAGE_UNAVAILABLE', 'error' => '匿名化キーを準備できません。']);
    }
    @chmod(SECRET_FILE, 0600);
    return $secret;
}

function sessionToken(): string
{
    $current = (string) ($_COOKIE[COOKIE_NAME] ?? '');
    if (preg_match('/^[a-f0-9]{48}$/D', $current)) {
        return $current;
    }
    $token = bin2hex(random_bytes(24));
    setcookie(COOKIE_NAME, $token, [
        'expires' => time() + 31536000,
        'path' => '/sound-form/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    return $token;
}

function anonymousHash(string $scope, string $value): string
{
    return hash_hmac('sha256', $scope . ':' . $value, secretKey());
}

function defaultState(): array
{
    return [
        'version' => MODEL_VERSION,
        'revision' => 0,
        'updatedAt' => '',
        'quarantine' => [],
        'promoted' => [],
        'rates' => [],
        'metrics' => [
            'acceptedSubmissions' => 0,
            'duplicateSubmissions' => 0,
            'rejectedSubmissions' => 0,
            'promotions' => 0,
        ],
    ];
}

function readJsonFile(string $path, array $fallback): array
{
    if (!is_readable($path)) {
        return $fallback;
    }
    $decoded = json_decode((string) file_get_contents($path), true);
    return is_array($decoded) ? $decoded : $fallback;
}

function loadState(): array
{
    return array_replace_recursive(defaultState(), readJsonFile(STATE_FILE, []));
}

function saveState(array $state): void
{
    $temporary = STATE_FILE . '.tmp-' . bin2hex(random_bytes(6));
    $encoded = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false || file_put_contents($temporary, $encoded, LOCK_EX) === false || !rename($temporary, STATE_FILE)) {
        @unlink($temporary);
        respond(503, ['ok' => false, 'code' => 'STORAGE_UNAVAILABLE', 'error' => 'フィードバックを保存できません。']);
    }
    @chmod(STATE_FILE, 0600);
}

function acquireStateLock()
{
    ensureDataRoot();
    $lock = fopen(LOCK_FILE, 'c');
    if ($lock === false || !flock($lock, LOCK_EX)) {
        if (is_resource($lock)) {
            fclose($lock);
        }
        respond(503, ['ok' => false, 'code' => 'LOCK_UNAVAILABLE', 'error' => 'フィードバック処理が混雑しています。']);
    }
    return $lock;
}

function releaseStateLock($lock): void
{
    if (!is_resource($lock)) {
        return;
    }
    flock($lock, LOCK_UN);
    fclose($lock);
}

function validGenre($value): string
{
    $genre = is_string($value) ? trim($value) : '';
    return in_array($genre, GENRES, true) ? $genre : '';
}

function validSignature($value): array
{
    if (!is_array($value) || count($value) !== 20) {
        return [];
    }
    $signature = [];
    foreach ($value as $item) {
        if (!is_numeric($item)) {
            return [];
        }
        $number = (float) $item;
        if (!is_finite($number) || $number < 0 || $number > 1) {
            return [];
        }
        $signature[] = round($number, 4);
    }
    return $signature;
}

function featureDistance(array $left, array $right): float
{
    if (count($left) !== count($right) || count($left) === 0) {
        return INF;
    }
    $total = 0.0;
    foreach ($left as $index => $value) {
        $delta = (float) $value - (float) $right[$index];
        $total += $delta * $delta;
    }
    return sqrt($total / count($left));
}

function nearestClusterIndex(array $clusters, array $signature): int
{
    $bestIndex = -1;
    $bestDistance = INF;
    foreach ($clusters as $index => $cluster) {
        $distance = featureDistance($signature, is_array($cluster['signature'] ?? null) ? $cluster['signature'] : []);
        if ($distance < $bestDistance) {
            $bestIndex = (int) $index;
            $bestDistance = $distance;
        }
    }
    return $bestDistance <= CLUSTER_DISTANCE ? $bestIndex : -1;
}

function updateRateLimit(array &$state, string $networkHash): void
{
    $now = time();
    $day = gmdate('Y-m-d', $now);
    $rates = is_array($state['rates'] ?? null) ? $state['rates'] : [];
    foreach ($rates as $hash => $rate) {
        if (($rate['day'] ?? '') !== $day) {
            unset($rates[$hash]);
        }
    }
    $rate = is_array($rates[$networkHash] ?? null) ? $rates[$networkHash] : ['day' => $day, 'count' => 0, 'recent' => []];
    $recent = array_values(array_filter((array) ($rate['recent'] ?? []), static fn($timestamp) => (int) $timestamp >= $now - 600));
    if ((int) ($rate['count'] ?? 0) >= MAX_DAILY_NETWORK_SUBMISSIONS || count($recent) >= MAX_TEN_MINUTE_NETWORK_SUBMISSIONS) {
        $state['rates'] = $rates;
        respond(429, ['ok' => false, 'code' => 'RATE_LIMITED', 'error' => '短時間の送信上限に達しました。時間を置いてください。']);
    }
    $recent[] = $now;
    $rates[$networkHash] = ['day' => $day, 'count' => (int) ($rate['count'] ?? 0) + 1, 'recent' => $recent];
    $state['rates'] = $rates;
}

function clusterConsensus(array $cluster): array
{
    $votes = [];
    $baselineCorrect = 0;
    $reviewVotes = 0;
    foreach ((array) ($cluster['voters'] ?? []) as $vote) {
        $choice = validGenre($vote['choice'] ?? '');
        $predicted = validGenre($vote['predicted'] ?? '');
        if ($choice === '') {
            continue;
        }
        $votes[$choice] = ($votes[$choice] ?? 0) + 1;
        if ($predicted === $choice) {
            $baselineCorrect++;
        }
        if (!empty($vote['needsReview'])) {
            $reviewVotes++;
        }
    }
    arsort($votes);
    $total = array_sum($votes);
    $target = (string) (array_key_first($votes) ?? '');
    $topVotes = (int) ($votes[$target] ?? 0);
    $share = $total > 0 ? $topVotes / $total : 0.0;
    $accuracyImprovement = $topVotes - $baselineCorrect;
    $coverageImprovement = $topVotes === $total && $reviewVotes === $total;
    return [
        'target' => $target,
        'votes' => $votes,
        'total' => $total,
        'topVotes' => $topVotes,
        'share' => $share,
        'baselineCorrect' => $baselineCorrect,
        'accuracyImprovement' => $accuracyImprovement,
        'coverageImprovement' => $coverageImprovement,
        'eligible' => $total >= MIN_UNIQUE_VOTERS
            && $topVotes >= MIN_UNIQUE_VOTERS
            && $share >= MIN_CONSENSUS_SHARE
            && ($accuracyImprovement > 0 || $coverageImprovement),
    ];
}

function balancedAccuracy(array $records, array $predictions): float
{
    $byGenre = [];
    foreach ($records as $index => $record) {
        $expected = validGenre($record['expected'] ?? '');
        if ($expected === '') {
            continue;
        }
        if (!isset($byGenre[$expected])) {
            $byGenre[$expected] = ['correct' => 0, 'total' => 0];
        }
        $byGenre[$expected]['total']++;
        if (($predictions[$index] ?? '') === $expected) {
            $byGenre[$expected]['correct']++;
        }
    }
    if (count($byGenre) === 0) {
        return 0.0;
    }
    $total = 0.0;
    foreach ($byGenre as $stats) {
        $total += $stats['correct'] / max(1, $stats['total']);
    }
    return $total / count($byGenre);
}

function evaluateCandidate(array $signature, string $target): array
{
    $holdout = readJsonFile(HOLDOUT_FILE, []);
    $records = is_array($holdout['records'] ?? null) ? $holdout['records'] : [];
    if (count($records) < 96) {
        return ['ok' => false, 'reason' => 'HOLDOUT_UNAVAILABLE', 'count' => count($records)];
    }
    $before = [];
    $after = [];
    foreach ($records as $index => $record) {
        $baseline = validGenre($record['baselinePrediction'] ?? '');
        $before[$index] = $baseline;
        $distance = featureDistance($signature, is_array($record['signature'] ?? null) ? $record['signature'] : []);
        $after[$index] = $distance <= CLUSTER_DISTANCE ? $target : $baseline;
    }
    $correct = static function (array $predictions) use ($records): int {
        $count = 0;
        foreach ($records as $index => $record) {
            if (($predictions[$index] ?? '') === validGenre($record['expected'] ?? '')) {
                $count++;
            }
        }
        return $count;
    };
    $beforeCorrect = $correct($before);
    $afterCorrect = $correct($after);
    $beforeTop1 = $beforeCorrect / count($records) * 100;
    $afterTop1 = $afterCorrect / count($records) * 100;
    $beforeBalanced = balancedAccuracy($records, $before) * 100;
    $afterBalanced = balancedAccuracy($records, $after) * 100;
    $top1Delta = $afterTop1 - $beforeTop1;
    $balancedDelta = $afterBalanced - $beforeBalanced;
    return [
        'ok' => $top1Delta >= -MAX_TOP1_REGRESSION_POINTS && $balancedDelta >= -MAX_TOP1_REGRESSION_POINTS,
        'reason' => 'FIXED_HOLDOUT',
        'count' => count($records),
        'beforeTop1' => round($beforeTop1, 3),
        'afterTop1' => round($afterTop1, 3),
        'top1Delta' => round($top1Delta, 3),
        'beforeBalancedTop1' => round($beforeBalanced, 3),
        'afterBalancedTop1' => round($afterBalanced, 3),
        'balancedTop1Delta' => round($balancedDelta, 3),
    ];
}

function promotedModel(array $state): array
{
    $records = [];
    foreach ((array) ($state['promoted'] ?? []) as $record) {
        $target = validGenre($record['targetName'] ?? '');
        $signature = validSignature($record['signature'] ?? null);
        if ($target === '' || count($signature) !== 20) {
            continue;
        }
        $records[] = [
            'version' => FEATURE_VERSION,
            'id' => (string) ($record['id'] ?? ''),
            'targetName' => $target,
            'targetMacro' => '',
            'signature' => $signature,
            'confidence' => max(60, min(92, (int) ($record['confidence'] ?? 76))),
            'voteShare' => round(max(0, min(1, (float) ($record['voteShare'] ?? 0))), 3),
            'evidenceMargin' => round(max(0, min(1, (float) ($record['evidenceMargin'] ?? 0))), 3),
            'support' => max(1, min(20, (int) ($record['support'] ?? 1))),
            'updatedAt' => (string) ($record['updatedAt'] ?? ''),
        ];
    }
    return [
        'ok' => true,
        'modelVersion' => MODEL_VERSION,
        'revision' => (int) ($state['revision'] ?? 0),
        'updatedAt' => (string) ($state['updatedAt'] ?? ''),
        'applyDistance' => APPLY_DISTANCE,
        'promotedRecords' => $records,
        'stats' => [
            'promoted' => count($records),
            'quarantine' => count((array) ($state['quarantine'] ?? [])),
            'acceptedSubmissions' => (int) ($state['metrics']['acceptedSubmissions'] ?? 0),
        ],
    ];
}

function promoteEligibleCluster(array &$state, int $clusterIndex): array
{
    $cluster = $state['quarantine'][$clusterIndex];
    $consensus = clusterConsensus($cluster);
    if (!$consensus['eligible']) {
        return ['promoted' => false, 'consensus' => $consensus];
    }
    $signature = validSignature($cluster['signature'] ?? null);
    $target = validGenre($consensus['target']);
    foreach ((array) ($state['promoted'] ?? []) as $record) {
        if (($record['targetName'] ?? '') !== $target && featureDistance($signature, (array) ($record['signature'] ?? [])) <= CLUSTER_DISTANCE) {
            return ['promoted' => false, 'consensus' => $consensus, 'blocked' => 'PROMOTED_CONFLICT'];
        }
    }
    $evaluation = evaluateCandidate($signature, $target);
    if (empty($evaluation['ok'])) {
        $state['quarantine'][$clusterIndex]['lastEvaluation'] = $evaluation;
        return ['promoted' => false, 'consensus' => $consensus, 'evaluation' => $evaluation];
    }
    $now = gmdate(DATE_ATOM);
    $nearest = -1;
    foreach ((array) ($state['promoted'] ?? []) as $index => $record) {
        if (($record['targetName'] ?? '') === $target && featureDistance($signature, (array) ($record['signature'] ?? [])) <= CLUSTER_DISTANCE) {
            $nearest = (int) $index;
            break;
        }
    }
    $promoted = [
        'id' => 'shared-' . substr(hash('sha256', $target . ':' . implode(',', $signature)), 0, 18),
        'targetName' => $target,
        'signature' => $signature,
        'confidence' => min(92, 62 + $consensus['topVotes'] * 4),
        'voteShare' => round($consensus['share'], 3),
        'evidenceMargin' => round(max(0.08, $consensus['share'] - (1 - $consensus['share'])), 3),
        'support' => min(20, $consensus['topVotes']),
        'updatedAt' => $now,
        'evaluation' => $evaluation,
    ];
    if ($nearest >= 0) {
        $previous = $state['promoted'][$nearest];
        $weight = max(1, (int) ($previous['support'] ?? 1));
        $promoted['signature'] = array_map(static fn($old, $new) => round(((float) $old * $weight + (float) $new) / ($weight + 1), 4), $previous['signature'], $signature);
        $promoted['support'] = min(20, $weight + $consensus['topVotes']);
        $promoted['id'] = (string) ($previous['id'] ?? $promoted['id']);
        $state['promoted'][$nearest] = $promoted;
    } else {
        $state['promoted'][] = $promoted;
        $state['promoted'] = array_slice($state['promoted'], -96);
    }
    array_splice($state['quarantine'], $clusterIndex, 1);
    $state['metrics']['promotions'] = (int) ($state['metrics']['promotions'] ?? 0) + 1;
    $state['revision'] = (int) ($state['revision'] ?? 0) + 1;
    return ['promoted' => true, 'consensus' => $consensus, 'evaluation' => $evaluation, 'record' => $promoted];
}

$method = $_SERVER['REQUEST_METHOD'] ?? '';
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = ['https://aun-graphic.jp', 'https://www.aun-graphic.jp'];

if ($method === 'OPTIONS') {
    if (in_array($origin, $allowedOrigins, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
        header('Vary: Origin');
    }
    respond(200, ['ok' => true]);
}

sessionToken();

if ($method === 'GET') {
    respond(200, promotedModel(loadState()));
}

if ($method !== 'POST') {
    header('Allow: GET, POST, OPTIONS');
    respond(405, ['ok' => false, 'code' => 'METHOD_NOT_ALLOWED', 'error' => 'GETまたはPOSTリクエストのみ利用できます。']);
}

if (!in_array($origin, $allowedOrigins, true)) {
    respond(403, ['ok' => false, 'code' => 'ORIGIN_NOT_ALLOWED', 'error' => 'このサイトからはフィードバックを送信できません。']);
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
if (!is_array($payload) || ($payload['action'] ?? '') !== 'submit-genre-feedback') {
    respond(400, ['ok' => false, 'code' => 'INVALID_REQUEST', 'error' => 'ジャンルフィードバックが不正です。']);
}
if (($payload['consent'] ?? false) !== true) {
    respond(400, ['ok' => false, 'code' => 'CONSENT_REQUIRED', 'error' => '匿名音響特徴の送信に同意してください。']);
}
if (trim((string) ($payload['website'] ?? '')) !== '') {
    respond(400, ['ok' => false, 'code' => 'AUTOMATION_REJECTED', 'error' => '送信を受け付けられません。']);
}
$interactionMs = (int) ($payload['interactionMs'] ?? 0);
if ($interactionMs < MIN_INTERACTION_MS || $interactionMs > 3600000) {
    respond(400, ['ok' => false, 'code' => 'INTERACTION_INVALID', 'error' => '確認操作を完了してから送信してください。']);
}
$signature = validSignature($payload['signature'] ?? null);
$predicted = validGenre($payload['predictedGenre'] ?? '');
$selected = validGenre($payload['selectedGenre'] ?? '');
$reviewContext = (string) ($payload['reviewContext'] ?? '');
if (count($signature) !== 20 || $predicted === '' || $selected === '' || !in_array($reviewContext, ['post-multi-window', 'uploaded-review'], true)) {
    respond(400, ['ok' => false, 'code' => 'INVALID_FEEDBACK', 'error' => 'ジャンルまたは匿名音響特徴が不正です。']);
}

$lock = acquireStateLock();
$state = loadState();
$remoteAddress = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
$networkHash = anonymousHash('network-' . gmdate('Y-m-d'), $remoteAddress);
updateRateLimit($state, $networkHash);
$visitorHash = anonymousHash('visitor', sessionToken());
$clusterIndex = nearestClusterIndex((array) ($state['quarantine'] ?? []), $signature);
$now = gmdate(DATE_ATOM);
if ($clusterIndex < 0) {
    $state['quarantine'][] = [
        'id' => 'quarantine-' . substr(hash('sha256', implode(',', $signature)), 0, 18),
        'signature' => $signature,
        'voters' => [],
        'createdAt' => $now,
        'updatedAt' => $now,
    ];
    $state['quarantine'] = array_slice($state['quarantine'], -256);
    $clusterIndex = count($state['quarantine']) - 1;
}
if (isset($state['quarantine'][$clusterIndex]['voters'][$visitorHash])) {
    $state['metrics']['duplicateSubmissions'] = (int) ($state['metrics']['duplicateSubmissions'] ?? 0) + 1;
    saveState($state);
    releaseStateLock($lock);
    respond(409, ['ok' => false, 'code' => 'DUPLICATE_FEEDBACK', 'error' => 'この音響境界への回答は送信済みです。']);
}
$cluster = &$state['quarantine'][$clusterIndex];
$previousCount = count((array) ($cluster['voters'] ?? []));
$cluster['signature'] = array_map(static fn($old, $new) => round(((float) $old * $previousCount + (float) $new) / ($previousCount + 1), 4), $cluster['signature'], $signature);
$cluster['voters'][$visitorHash] = [
    'choice' => $selected,
    'predicted' => $predicted,
    'needsReview' => !empty($payload['needsReview']),
];
$cluster['updatedAt'] = $now;
$state['metrics']['acceptedSubmissions'] = (int) ($state['metrics']['acceptedSubmissions'] ?? 0) + 1;
$promotion = promoteEligibleCluster($state, $clusterIndex);
$state['updatedAt'] = $now;
saveState($state);
releaseStateLock($lock);

respond(200, [
    'ok' => true,
    'status' => !empty($promotion['promoted']) ? 'promoted' : 'quarantine',
    'consensus' => [
        'votes' => (int) ($promotion['consensus']['total'] ?? 1),
        'share' => round((float) ($promotion['consensus']['share'] ?? 1), 3),
        'minimumVotes' => MIN_UNIQUE_VOTERS,
        'minimumShare' => MIN_CONSENSUS_SHARE,
    ],
    'evaluation' => $promotion['evaluation'] ?? null,
    'model' => promotedModel($state),
]);
