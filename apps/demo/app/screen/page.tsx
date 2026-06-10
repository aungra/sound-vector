"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { aggregateResonanceTypes, aggregateTags, nextTrackReason, resonanceLabel, risingTshirts } from "@/lib/matching";
import { getResonances, getSessions, getTshirts, onStoreUpdate } from "@/lib/store";
import type { Resonance, Tshirt, VisitorSession } from "@/lib/types";

function useLiveArchive() {
  const [state, setState] = useState(() => ({
    sessions: [] as VisitorSession[],
    resonances: [] as Resonance[],
    tshirts: [] as Tshirt[]
  }));

  useEffect(() => {
    const refresh = () => setState({ sessions: getSessions(), resonances: getResonances(), tshirts: getTshirts() });
    refresh();
    const timer = window.setInterval(refresh, 5000);
    const unsubscribe = onStoreUpdate(refresh);
    return () => {
      window.clearInterval(timer);
      unsubscribe();
    };
  }, []);

  return state;
}

export default function ScreenPage() {
  const { sessions, resonances, tshirts } = useLiveArchive();
  const topTags = aggregateTags(sessions, resonances, tshirts);
  const resonanceTypes = aggregateResonanceTypes(resonances);
  const rising = risingTshirts(resonances, tshirts);
  const next = tshirts.length ? nextTrackReason(sessions, resonances, tshirts) : null;
  const displayTags: [string, number][] = topTags.length ? topTags : [["港", 1], ["雨", 1], ["夜", 1], ["低音", 1]];

  return (
    <main className="screen-grid min-h-screen overflow-hidden px-8 py-7 text-paper">
      <section className="mx-auto flex min-h-[calc(100vh-56px)] max-w-7xl flex-col">
        <header className="flex items-start justify-between gap-6 border-b border-paper/25 pb-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-delta">MUSIC MEMORY FITTING ROOM</p>
            <h1 className="mt-2 text-5xl font-black leading-none lg:text-7xl">会場の記憶</h1>
          </div>
          <Link href="/" className="rounded-full border border-paper/35 px-4 py-2 text-sm font-black">QR HOME</Link>
        </header>

        <div className="grid flex-1 gap-6 py-6 lg:grid-cols-[1.25fr_0.75fr]">
          <section className="rounded-lg border border-paper/20 bg-paper/5 p-6">
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-paper/55">Current dominant memories</p>
            <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              {displayTags.map(([tag, value]) => (
                <div key={tag} className="flex min-h-28 flex-col justify-between rounded-md border border-paper/20 bg-ink/50 p-4">
                  <span className="text-2xl font-black">{tag}</span>
                  <span className="text-sm font-bold text-paper/50">{Math.round(value * 10) / 10}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-paper/20 bg-paper/5 p-6">
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-paper/55">Resonance</p>
            <div className="mt-6 grid gap-3">
              {resonanceTypes.length ? (
                resonanceTypes.slice(0, 5).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between rounded-md border border-paper/20 bg-ink/50 p-4">
                    <span className="text-xl font-black">{resonanceLabel(type)}</span>
                    <span className="text-3xl font-black text-delta">{count}</span>
                  </div>
                ))
              ) : (
                <p className="rounded-md border border-paper/20 bg-ink/50 p-4 text-xl font-black">最初の共鳴を待っています</p>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-paper/20 bg-paper/5 p-6">
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-paper/55">Next music cue</p>
            <div className="mt-6 rounded-md border border-paper/20 bg-ink/50 p-5">
              <p className="text-sm font-black text-delta">{next?.reason ?? "来場者の記憶を待っています"}</p>
              <h2 className="mt-2 text-4xl font-black leading-tight">{next?.title ?? "未選曲"}</h2>
              <p className="mt-2 text-xl font-bold text-paper/70">{next?.artist}</p>
              <p className="mt-5 text-sm font-bold text-paper/50">from {next?.tshirtTitle ?? "MUSIC MEMORY FITTING ROOM"}</p>
            </div>
          </section>

          <section className="rounded-lg border border-paper/20 bg-paper/5 p-6">
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-paper/55">Rising works</p>
            <div className="mt-6 grid gap-3">
              {rising.length ? (
                rising.map(({ tshirt, count }) => (
                  <div key={tshirt.id} className="rounded-md border border-paper/20 bg-ink/50 p-4">
                    <p className="text-xl font-black">{tshirt.title}</p>
                    <p className="mt-1 text-sm font-bold text-paper/55">{count} recent resonances</p>
                  </div>
                ))
              ) : (
                <p className="rounded-md border border-paper/20 bg-ink/50 p-4 text-xl font-black">作品の反応がここに浮かびます</p>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
