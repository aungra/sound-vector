export function createAnalysisResultCache({
  maxEntries = 24,
  ttlMs = 6 * 60 * 60 * 1000,
  now = () => Date.now(),
} = {}) {
  const entries = new Map();
  const capacity = Math.max(1, Number(maxEntries) || 1);
  const lifetime = Math.max(1000, Number(ttlMs) || 1000);

  const removeExpired = currentTime => {
    for (const [key, entry] of entries) {
      if (currentTime - entry.createdAt >= lifetime) entries.delete(key);
    }
  };

  return {
    get(key) {
      const id = String(key || "");
      if (!id) return null;
      const currentTime = now();
      removeExpired(currentTime);
      const entry = entries.get(id);
      if (!entry) return null;
      entries.delete(id);
      entries.set(id, entry);
      return entry.value;
    },
    set(key, value) {
      const id = String(key || "");
      if (!id || value == null) return;
      removeExpired(now());
      entries.delete(id);
      entries.set(id, { createdAt: now(), value });
      while (entries.size > capacity) {
        entries.delete(entries.keys().next().value);
      }
    },
    get size() {
      removeExpired(now());
      return entries.size;
    },
  };
}
