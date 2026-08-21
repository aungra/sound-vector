<?php
declare(strict_types=1);

$source = (string) file_get_contents(__DIR__ . '/audio-analyze.php');
$functionStart = strpos($source, 'function localResponseNeedsRichAnalysis');
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

$cases = [
    ['low local confidence', payload([['label' => 'チップチューン', 'score' => 1.8]]), 200, true],
    ['missing prediction', payload([]), 200, true],
    ['malformed success', '{"ok":true}', 200, true],
    ['heartbeat whitespace', "  \n" . payload([['label' => 'ロック', 'score' => 80]]), 200, false],
    ['HTTP 200 error payload', payload([], false), 200, true],
    ['server error', payload([['label' => 'ロック', 'score' => 80]]), 503, true],
    ['adequate local result', payload([['label' => 'ロック', 'score' => 12]]), 200, false],
    ['strong local result', payload([['label' => 'ロック', 'score' => 80]]), 200, false],
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
    ['strong stable local result', payload(
        [['label' => 'ロック', 'score' => 80]],
        true,
        [
            'japaneseVocalEvidence' => ['available' => false],
            'embeddingGenrePrediction' => [
                'segmentConsensus' => ['available' => true, 'voteShare' => 1],
            ],
        ]
    ), 200, false],
];

foreach ($cases as [$name, $response, $status, $expected]) {
    $actual = localResponseNeedsRichAnalysis($response, $status);
    if ($actual !== $expected) {
        throw new RuntimeException("{$name}: expected " . json_encode($expected) . ', got ' . json_encode($actual));
    }
}

echo count($cases) . " proxy routing checks passed\n";
