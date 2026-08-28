<?php
declare(strict_types=1);

$source = (string) file_get_contents(__DIR__ . '/audio-analyze.php');
$timeoutMatches = preg_match('/const UPSTREAM_TIMEOUT_SECONDS = (\d+);/', $source, $matches);
if ($timeoutMatches !== 1 || (int) $matches[1] < 600) {
    throw new RuntimeException('The rich-analysis proxy timeout must cover cold exhibition inference.');
}
$functionStart = strpos($source, 'function responseHasRichAnalysisParity');
$requestStart = strpos($source, '$method =');
if ($functionStart === false || $requestStart === false || $functionStart >= $requestStart) {
    throw new RuntimeException('Routing function could not be isolated.');
}
eval(substr($source, 6, $requestStart - 6));

function payload(array $top, bool $ok = true, array $features = []): string
{
    return (string) json_encode([
        'ok' => $ok,
        'features' => array_replace_recursive([
            'embeddingGenrePrediction' => ['top' => $top],
        ], $features),
    ]);
}

$richFeatures = [
    'japaneseVocalEvidence' => ['available' => true],
    'embeddingGenrePrediction' => [
        'unknownSourceConsensus' => ['top' => [['label' => 'ロック', 'score' => 26]]],
    ],
];

$cases = [
    ['low local confidence', payload([['label' => 'チップチューン', 'score' => 1.8]]), 200, true],
    ['missing prediction', payload([]), 200, true],
    ['malformed success', '{"ok":true}', 200, true],
    ['heartbeat whitespace', "  \n" . payload([['label' => 'ロック', 'score' => 80]], true, $richFeatures), 200, false],
    ['HTTP 200 error payload', payload([], false), 200, true],
    ['server error', payload([['label' => 'ロック', 'score' => 80]]), 503, true],
    ['adequate local result without rich evidence', payload([['label' => 'ロック', 'score' => 12]]), 200, true],
    ['strong local result without rich evidence', payload([['label' => 'ロック', 'score' => 80]]), 200, true],
    ['strong but degraded conflict', payload(
        [['label' => 'チップチューン', 'score' => 80]],
        true,
        [
            'japaneseVocalEvidence' => ['available' => false],
            'embeddingGenrePrediction' => [
                'segmentConsensus' => ['available' => true, 'voteShare' => 0.333],
            ],
        ]
    ), 200, true],
    ['strong stable local result still lacks parity', payload(
        [['label' => 'ロック', 'score' => 80]],
        true,
        [
            'japaneseVocalEvidence' => ['available' => false],
            'embeddingGenrePrediction' => [
                'segmentConsensus' => ['available' => true, 'voteShare' => 1],
            ],
        ]
    ), 200, true],
    ['rich analyzer parity', payload(
        [['label' => 'ロック', 'score' => 11.6]],
        true,
        $richFeatures
    ), 200, false],
    ['vocal analyzer alone is insufficient', payload(
        [['label' => 'ロック', 'score' => 80]],
        true,
        ['japaneseVocalEvidence' => ['available' => true]]
    ), 200, true],
    ['external consensus alone is insufficient', payload(
        [['label' => 'ロック', 'score' => 80]],
        true,
        ['embeddingGenrePrediction' => ['unknownSourceConsensus' => ['top' => [['label' => 'ロック', 'score' => 26]]]]]
    ), 200, true],
];

foreach ($cases as [$name, $response, $status, $expected]) {
    $actual = responseNeedsRichAnalysis($response, $status);
    if ($actual !== $expected) {
        throw new RuntimeException("{$name}: expected " . json_encode($expected) . ', got ' . json_encode($actual));
    }
}

echo count($cases) . " proxy routing checks passed\n";
