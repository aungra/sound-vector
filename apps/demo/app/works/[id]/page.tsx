"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { addResonance, getCreators, getResonances, getTshirts } from "@/lib/store";
import { resonanceLabel } from "@/lib/matching";
import { resonanceLabels } from "@/lib/seed";
import type { ResonanceType } from "@/lib/types";

export default function WorkDetailPage() {
  const params = useParams<{ id: string }>();
  const [comment, setComment] = useState("");
  const [sentType, setSentType] = useState<ResonanceType | null>(null);
  const creators = useMemo(() => getCreators(), []);
  const tshirts = useMemo(() => getTshirts(), []);
  const [resonanceCount, setResonanceCount] = useState(() => getResonances().filter((item) => item.tshirtId === params.id).length);
  const tshirt = tshirts.find((item) => item.id === params.id);

  if (!tshirt) {
    return (
      <main className="min-h-screen px-4 py-5 sm:px-6 sm:py-8">
        <section className="quiet-panel mx-auto max-w-2xl rounded-lg p-6">
          <h1 className="text-3xl font-black">作品が見つかりません</h1>
          <Link href="/" className="mt-5 inline-block text-sm font-black text-tide underline">受付に戻る</Link>
        </section>
      </main>
    );
  }

  const creator = creators.find((item) => item.id === tshirt.creatorId);
  const selectedTshirt = tshirt;

  function resonate(type: ResonanceType) {
    addResonance(selectedTshirt.id, type, comment.trim() || undefined);
    setSentType(type);
    setComment("");
    setResonanceCount((count) => count + 1);
  }

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 sm:py-8">
      <article className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="quiet-panel rounded-lg p-4 sm:p-6">
          <Link href="/" className="text-sm font-black text-tide underline">受付に戻る</Link>
          <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,1fr)_280px]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-delta">{creator?.name ?? "Unknown Creator"}</p>
              <h1 className="mt-3 text-4xl font-black leading-none sm:text-6xl">{tshirt.title}</h1>
              <p className="mt-5 text-base leading-8 text-ink/78">{tshirt.description}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {tshirt.tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-line bg-paper px-3 py-1 text-xs font-bold">{tag}</span>
                ))}
              </div>
            </div>
            <div className="flex aspect-[3/4] items-center justify-center rounded-lg border border-line bg-[linear-gradient(150deg,#14120f,#446b50_48%,#d84f2a)] p-5 text-center text-2xl font-black leading-tight text-paper">
              {tshirt.title}
            </div>
          </div>
        </section>

        <aside className="quiet-panel rounded-lg p-4 sm:p-6">
          <h2 className="text-xl font-black">展示・販売</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="rounded-md border border-line bg-paper p-3">
              <dt className="font-black text-ink/55">展示位置</dt>
              <dd className="mt-1 font-black">{tshirt.location}</dd>
            </div>
            <div className="rounded-md border border-line bg-paper p-3">
              <dt className="font-black text-ink/55">価格</dt>
              <dd className="mt-1 font-black">{tshirt.price}</dd>
            </div>
            <div className="rounded-md border border-line bg-paper p-3">
              <dt className="font-black text-ink/55">在庫メモ</dt>
              <dd className="mt-1 font-black">{tshirt.stockNote}</dd>
            </div>
          </dl>
          <p className="mt-5 text-sm leading-6 text-ink/70">{creator?.profile}</p>
          {creator?.sns ? <p className="mt-2 text-sm font-black text-tide">{creator.sns}</p> : null}
        </aside>

        <section className="quiet-panel rounded-lg p-4 sm:p-6 lg:col-span-2">
          <div className="flex flex-col gap-2 border-b border-line pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-bold text-moss">10曲プレイリスト</p>
              <h2 className="text-2xl font-black">このTシャツの中で鳴っている曲</h2>
            </div>
            <span className="rounded-full bg-ink px-3 py-1 text-sm font-black text-paper">{resonanceCount} resonances</span>
          </div>
          <ol className="mt-5 grid gap-3 md:grid-cols-2">
            {tshirt.tracks.map((track, index) => (
              <li key={track.id} className="rounded-lg border border-line bg-paper p-4">
                <p className="text-xs font-black text-delta">TRACK {String(index + 1).padStart(2, "0")}</p>
                <h3 className="mt-1 text-lg font-black">{track.title}</h3>
                <p className="text-sm font-bold text-ink/65">{track.artist}</p>
                <p className="mt-3 text-sm leading-6 text-ink/75">{track.comment}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {track.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-line px-2 py-1 text-xs font-bold">{tag}</span>
                  ))}
                </div>
                {track.url ? <a className="mt-3 inline-block text-sm font-black text-tide underline" href={track.url}>外部リンク</a> : null}
              </li>
            ))}
          </ol>
        </section>

        <section className="quiet-panel rounded-lg p-4 sm:p-6 lg:col-span-2">
          <h2 className="text-2xl font-black">共鳴を残す</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/70">
            投票ではなく、あなたの身体に起きた反応を会場に残します。匿名でスクリーンとZINE用アーカイブへ反映されます。
          </p>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            className="mt-4 min-h-24 w-full rounded-md border border-line bg-paper p-3 text-sm"
            placeholder="任意コメント"
          />
          <div className="mt-4 grid gap-2 sm:grid-cols-5">
            {(Object.keys(resonanceLabels) as ResonanceType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => resonate(type)}
                className="min-h-12 rounded-md border border-ink bg-ink px-3 py-2 text-sm font-black text-paper transition hover:bg-delta"
              >
                {resonanceLabel(type)}
              </button>
            ))}
          </div>
          {sentType ? <p className="mt-4 rounded-md bg-moss px-4 py-3 text-sm font-black text-paper">{resonanceLabel(sentType)} を残しました。</p> : null}
        </section>
      </article>
    </main>
  );
}
