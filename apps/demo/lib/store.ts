"use client";

import type { Creator, Resonance, ResonanceType, Tshirt, VisitorSession } from "./types";
import { creators as seedCreators, tshirts as seedTshirts } from "./seed";
import { recommendTshirts, uniqueTags } from "./matching";

const CREATORS_KEY = "mmfr.creators";
const TSHIRTS_KEY = "mmfr.tshirts";
const SESSIONS_KEY = "mmfr.sessions";
const RESONANCES_KEY = "mmfr.resonances";
const EVENT_NAME = "mmfr:update";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function getCreators() {
  return readJson<Creator[]>(CREATORS_KEY, seedCreators);
}

export function getTshirts() {
  return readJson<Tshirt[]>(TSHIRTS_KEY, seedTshirts);
}

export function getSessions() {
  return readJson<VisitorSession[]>(SESSIONS_KEY, []);
}

export function getResonances() {
  return readJson<Resonance[]>(RESONANCES_KEY, []);
}

export function saveCreators(creators: Creator[]) {
  writeJson(CREATORS_KEY, creators);
}

export function saveTshirts(tshirts: Tshirt[]) {
  writeJson(TSHIRTS_KEY, tshirts);
}

export function createSession(answers: Record<string, string[]>) {
  const tags = uniqueTags(Object.values(answers).flat());
  const tshirts = getTshirts();
  const recommendedIds = recommendTshirts(tshirts, tags).map((item) => item.id);
  const session: VisitorSession = {
    id: crypto.randomUUID(),
    answers,
    tags,
    recommendedIds,
    createdAt: new Date().toISOString()
  };
  writeJson(SESSIONS_KEY, [session, ...getSessions()]);
  return session;
}

export function addResonance(tshirtId: string, type: ResonanceType, comment?: string) {
  const resonance: Resonance = {
    id: crypto.randomUUID(),
    tshirtId,
    type,
    comment,
    createdAt: new Date().toISOString()
  };
  writeJson(RESONANCES_KEY, [resonance, ...getResonances()]);
  return resonance;
}

export function exportArchiveData() {
  return {
    creators: getCreators(),
    tshirts: getTshirts(),
    visitorSessions: getSessions(),
    resonances: getResonances(),
    exportedAt: new Date().toISOString()
  };
}

export function onStoreUpdate(callback: () => void) {
  window.addEventListener(EVENT_NAME, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT_NAME, callback);
    window.removeEventListener("storage", callback);
  };
}
