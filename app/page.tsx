"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { questions } from "@/lib/seed";
import { createSession, getCreators, getTshirts } from "@/lib/store";
import type { Creator, Tshirt, VisitorSession } from "@/lib/types";

function creatorName(creators: Creator[], creatorId: string) {
  return creators.find((creator) => creator.id === creatorId)?.name ?? "Unknown Creator";
}

export default function HomePage() {
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [session, setSession] = useState<VisitorSession | null>(null);
  const creators = useMemo(() => getCreators(), []);
  const tshirts = useMemo(() => getTshirts(), []);
  const completeCount = questions.filter((question) => answers[question.id]?.length).length;
  const recommendations = session
    ? session.recommendedIds.map((id) => tshirts.find((item) => item.id === id)).filter((item): item is Tshirt => Boolean(item))
    : [];

  function toggleAnswer(questionId: string, value: string) {
    setAnswers((current) => {
      const values = current[questionId] ?? [];
      const nextValues = values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
      return { ...current, [questionId]: nextValues };
    });
  }

  function submit() {
    setSession(createSession(answers));
  }

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 sm:py-8">
      <section className="mx-auto flex max-w-5xl flex-col gap-5">
        <header className="quiet-panel rounded-lg p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-delta">DELTA & DOH PRESENTS</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-black leading-[0.95] sm:text-6xl">
            MUSIC MEMORY FITTING ROOM
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-ink/78">
            Tシャツを試着する前に、音楽の記憶を試着する。質問に答えると、あなたの中にある音楽体験に近いTシャツが会場から近づいてきます。
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold uppercase tracking-[0.16em]">
            <Link className="rounded-full border border-ink px-4 py-2" href="/screen">Screen</Link>
            <Link className="rounded-full border border-ink px-4 py-2" href="/admin">Admin</Link>
          </div>
        </header>

        {!session ? (
          <section className="quiet-panel rounded-lg p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3 border-b border-line pb-4">
              <h2 className="text-xl font-black">記憶の質問</h2>
              <span className="rounded-full bg-ink px-3 py-1 text-sm font-bold text-paper">{completeCount}/5</span>
            </div>
            <div className="mt-5 grid gap-5">
              {questions.map((question) => (
                <fieldset key={question.id} className="rounded-lg border border-line bg-paper/70 p-4">
                  <legend className="px-1 text-base font-black">{question.title}</legend>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {question.options.map((option) => {
                      const selected = answers[question.id]?.includes(option);
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => toggleAnswer(question.id, option)}
                          className={`min-h-10 rounded-full border px-4 py-2 text-sm font-bold transition ${
                            selected ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink hover:border-ink"
                          }`}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={completeCount < 2}
              className="mt-5 min-h-12 w-full rounded-md bg-delta px-5 py-3 text-base font-black text-paper disabled:cursor-not-allowed disabled:bg-line disabled:text-ink/45"
            >
              近いTシャツを探す
            </button>
          </section>
        ) : (
          <section className="quiet-panel rounded-lg p-4 sm:p-6">
            <div className="flex flex-col gap-2 border-b border-line pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-bold text-moss">あなたの記憶タグ</p>
                <h2 className="mt-1 text-2xl font-black">近い3枚のTシャツ</h2>
              </div>
              <button className="self-start rounded-full border border-ink px-4 py-2 text-sm font-bold" onClick={() => setSession(null)}>
                もう一度選ぶ
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {session.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-moss px-3 py-1 text-xs font-bold text-paper">{tag}</span>
              ))}
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {recommendations.map((tshirt, index) => (
                <Link key={tshirt.id} href={`/works/${tshirt.id}`} className="group rounded-lg border border-line bg-paper p-4 transition hover:border-ink">
                  <div className="flex aspect-[4/3] items-center justify-center rounded-md border border-line bg-[linear-gradient(135deg,#14120f,#1f5d70,#d84f2a)] p-4 text-center text-lg font-black text-paper">
                    {tshirt.image ? <span>{tshirt.title}</span> : <span>{tshirt.title}</span>}
                  </div>
                  <p className="mt-4 text-xs font-black text-delta">MATCH {index + 1}</p>
                  <h3 className="mt-1 text-xl font-black leading-tight">{tshirt.title}</h3>
                  <p className="mt-1 text-sm font-bold text-ink/65">{creatorName(creators, tshirt.creatorId)}</p>
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-ink/75">{tshirt.description}</p>
                  <p className="mt-4 text-sm font-black text-tide group-hover:underline">{tshirt.location}</p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
