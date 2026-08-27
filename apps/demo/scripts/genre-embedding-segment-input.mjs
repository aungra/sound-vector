export function embeddingSegmentArgs(segmentAudioPaths = [], sampledRanges = []) {
  return segmentAudioPaths.flatMap((segmentPath, index) => [
    "--segment-audio", segmentPath,
    "--segment-offset", String(Number(sampledRanges[index]?.startSeconds || 0)),
  ]);
}
