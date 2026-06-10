import type { Resonance, ResonanceType, Tshirt, VisitorSession } from "./types";
import { resonanceLabels } from "./seed";

export function uniqueTags(tags: string[]) {
  return Array.from(new Set(tags.filter(Boolean)));
}

export function scoreTshirt(tshirt: Tshirt, tags: string[]) {
  const selected = new Set(tags);
  const trackTags = tshirt.tracks.flatMap((track) => track.tags);
  const allTags = [...tshirt.tags, ...trackTags];
  return allTags.reduce((score, tag) => score + (selected.has(tag) ? 1 : 0), 0);
}

export function recommendTshirts(tshirts: Tshirt[], tags: string[], count = 3) {
  return [...tshirts]
    .map((tshirt) => ({ tshirt, score: scoreTshirt(tshirt, tags) }))
    .sort((a, b) => b.score - a.score || a.tshirt.title.localeCompare(b.tshirt.title))
    .slice(0, count)
    .map(({ tshirt }) => tshirt);
}

export function aggregateTags(sessions: VisitorSession[], resonances: Resonance[], tshirts: Tshirt[]) {
  const counts = new Map<string, number>();
  sessions.forEach((session) => session.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
  resonances.forEach((resonance) => {
    const tshirt = tshirts.find((item) => item.id === resonance.tshirtId);
    tshirt?.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 0.35));
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
}

export function aggregateResonanceTypes(resonances: Resonance[]) {
  const counts = new Map<ResonanceType, number>();
  resonances.forEach((item) => counts.set(item.type, (counts.get(item.type) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export function risingTshirts(resonances: Resonance[], tshirts: Tshirt[]) {
  const recentCutoff = Date.now() - 1000 * 60 * 20;
  const counts = new Map<string, number>();
  resonances
    .filter((item) => new Date(item.createdAt).getTime() >= recentCutoff)
    .forEach((item) => counts.set(item.tshirtId, (counts.get(item.tshirtId) ?? 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, count]) => ({ tshirt: tshirts.find((item) => item.id === id), count }))
    .filter((item): item is { tshirt: Tshirt; count: number } => Boolean(item.tshirt));
}

export function nextTrackReason(sessions: VisitorSession[], resonances: Resonance[], tshirts: Tshirt[]) {
  const topTag = aggregateTags(sessions, resonances, tshirts)[0]?.[0] ?? "港";
  const candidates = tshirts.flatMap((tshirt) =>
    tshirt.tracks
      .filter((track) => track.tags.includes(topTag))
      .map((track) => ({ tshirt, track }))
  );
  const candidate = candidates[0] ?? { tshirt: tshirts[0], track: tshirts[0]?.tracks[0] };
  return {
    tag: topTag,
    title: candidate.track?.title ?? "未選曲",
    artist: candidate.track?.artist ?? "",
    tshirtTitle: candidate.tshirt?.title ?? "",
    reason: `「${topTag}」に反応した記憶が増えているため`
  };
}

export function resonanceLabel(type: ResonanceType) {
  return resonanceLabels[type];
}
