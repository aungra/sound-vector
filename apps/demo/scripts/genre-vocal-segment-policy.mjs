export function vocalEvidenceAudioPath(segmentAudioPaths = [], requestedIndex = 0, fallbackPath = "") {
  const index = Number.isInteger(requestedIndex) && requestedIndex >= 0 ? requestedIndex : 0;
  return segmentAudioPaths[index] || segmentAudioPaths[0] || fallbackPath;
}
