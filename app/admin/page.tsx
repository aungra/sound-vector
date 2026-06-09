"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { aggregateResonanceTypes, aggregateTags, resonanceLabel } from "@/lib/matching";
import {
  exportArchiveData,
  getCreators,
  getResonances,
  getSessions,
  getTshirts,
  onStoreUpdate,
  saveCreators,
  saveTshirts
} from "@/lib/store";
import type { Creator, Resonance, Tshirt, VisitorSession } from "@/lib/types";

function download(filename: string, content: string, type = "application/json") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

function archiveCsv(tshirts: Tshirt[], resonances: Resonance[]) {
  const rows = [["work_id", "title", "resonance_type", "comment", "created_at"]];
  resonances.forEach((item) => {
    const work = tshirts.find((tshirt) => tshirt.id === item.tshirtId);
    rows.push([item.tshirtId, work?.title ?? "", item.type, item.comment ?? "", item.createdAt]);
  });
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

export default function AdminPage() {
  const [creatorsText, setCreatorsText] = useState("");
  const [tshirtsText, setTshirtsText] = useState("");
  const [message, setMessage] = useState("");
  const [sessions, setSessions] = useState<VisitorSession[]>([]);
  const [resonances, setResonances] = useState<Resonance[]>([]);
  const creators = useMemo(() => {
    try {
      return JSON.parse(creatorsText) as Creator[];
    } catch {
      return [] as Creator[];
    }
  }, [creatorsText]);
  const tshirts = useMemo(() => {
    try {
      return JSON.parse(tshirtsText) as Tshirt[];
    } catch {
      return [] as Tshirt[];
    }
  }, [tshirtsText]);
  const tags = aggregateTags(sessions, resonances, tshirts);
  const resonanceTypes = aggregateResonanceTypes(resonances);

  useEffect(() => {
    const refresh = () => {
      setCreatorsText(JSON.stringify(getCreators(), null, 2));
      setTshirtsText(JSON.stringify(getTshirts(), null, 2));
      setSessions(getSessions());
      setResonances(getResonances());
    };
    refresh();
    return onStoreUpdate(refresh);
  }, []);

  function saveAll() {
    try {
      const parsedCreators = JSON.parse(creatorsText) as Creator[];
      const parsedTshirts = JSON.parse(tshirtsText) as Tshirt[];
      saveCreators(parsedCreators);
      saveTshirts(parsedTshirts);
      setMessage("保存しました。");
    } catch {
      setMessage("JSONの形式を確認してください。");
    }
  }

  function addCreator() {
    const next = [
      ...creators,
      {
        id: `c-${String(creators.length + 1).padStart(2, "0")}`,
        name: "New Creator",
        profile: "プロフィールを入力",
        sns: ""
      }
    ];
    setCreatorsText(JSON.stringify(next, null, 2));
  }

  function addTshirt() {
    const creatorId = creators[0]?.id ?? "c-01";
    const next = [
      ...tshirts,
      {
        id: `t-${String(tshirts.length + 1).padStart(2, "0")}`,
        creatorId,
        title: "New Music Shirt",
        description: "音楽体験から生まれたTシャツの説明を入力",
        location: "未設定",
        price: "未設定",
        stockNote: "未設定",
        tags: ["港", "夜"],
        tracks: [
          {
            id: `t-${String(tshirts.length + 1).padStart(2, "0")}-01`,
            title: "Track Title",
            artist: "Artist",
            url: "",
            comment: "曲にまつわる短いコメント",
            tags: ["港", "夜"]
          }
        ]
      }
    ];
    setTshirtsText(JSON.stringify(next, null, 2));
  }

  function exportJson() {
    download("music-memory-fitting-room-archive.json", JSON.stringify(exportArchiveData(), null, 2));
  }

  function exportCsv() {
    download("music-memory-fitting-room-resonances.csv", archiveCsv(tshirts, resonances), "text/csv");
  }

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 sm:py-8">
      <section className="mx-auto grid max-w-7xl gap-5">
        <header className="quiet-panel rounded-lg p-5 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-delta">ADMIN</p>
              <h1 className="mt-2 text-4xl font-black leading-none sm:text-5xl">運営管理</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="rounded-full border border-ink px-4 py-2 text-sm font-black">Home</Link>
              <Link href="/screen" className="rounded-full border border-ink px-4 py-2 text-sm font-black">Screen</Link>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <div className="quiet-panel rounded-lg p-4">
            <p className="text-sm font-bold text-ink/55">来場セッション</p>
            <p className="mt-2 text-4xl font-black">{sessions.length}</p>
          </div>
          <div className="quiet-panel rounded-lg p-4">
            <p className="text-sm font-bold text-ink/55">共鳴</p>
            <p className="mt-2 text-4xl font-black">{resonances.length}</p>
          </div>
          <div className="quiet-panel rounded-lg p-4">
            <p className="text-sm font-bold text-ink/55">出展者</p>
            <p className="mt-2 text-4xl font-black">{creators.length}</p>
          </div>
          <div className="quiet-panel rounded-lg p-4">
            <p className="text-sm font-bold text-ink/55">Tシャツ</p>
            <p className="mt-2 text-4xl font-black">{tshirts.length}</p>
          </div>
        </section>

        <section className="quiet-panel rounded-lg p-4 sm:p-6">
          <div className="flex flex-wrap gap-2">
            <button onClick={addCreator} className="rounded-md bg-moss px-4 py-2 text-sm font-black text-paper">出展者を追加</button>
            <button onClick={addTshirt} className="rounded-md bg-tide px-4 py-2 text-sm font-black text-paper">Tシャツを追加</button>
            <button onClick={saveAll} className="rounded-md bg-delta px-4 py-2 text-sm font-black text-paper">保存</button>
            <button onClick={exportJson} className="rounded-md border border-ink px-4 py-2 text-sm font-black">JSON書き出し</button>
            <button onClick={exportCsv} className="rounded-md border border-ink px-4 py-2 text-sm font-black">CSV書き出し</button>
          </div>
          {message ? <p className="mt-3 rounded-md bg-ink px-4 py-3 text-sm font-black text-paper">{message}</p> : null}
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="quiet-panel rounded-lg p-4 sm:p-6">
            <h2 className="text-xl font-black">出展者 JSON</h2>
            <textarea
              value={creatorsText}
              onChange={(event) => setCreatorsText(event.target.value)}
              className="mt-4 h-[420px] w-full rounded-md border border-line bg-paper p-3 font-mono text-xs leading-5"
            />
          </div>
          <div className="quiet-panel rounded-lg p-4 sm:p-6">
            <h2 className="text-xl font-black">Tシャツ / プレイリスト JSON</h2>
            <textarea
              value={tshirtsText}
              onChange={(event) => setTshirtsText(event.target.value)}
              className="mt-4 h-[420px] w-full rounded-md border border-line bg-paper p-3 font-mono text-xs leading-5"
            />
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="quiet-panel rounded-lg p-4 sm:p-6">
            <h2 className="text-xl font-black">タグ傾向</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {tags.map(([tag, count]) => (
                <span key={tag} className="rounded-full bg-ink px-3 py-1 text-sm font-black text-paper">{tag} / {Math.round(count * 10) / 10}</span>
              ))}
            </div>
          </div>
          <div className="quiet-panel rounded-lg p-4 sm:p-6">
            <h2 className="text-xl font-black">共鳴傾向</h2>
            <div className="mt-4 grid gap-2">
              {resonanceTypes.map(([type, count]) => (
                <div key={type} className="flex justify-between rounded-md border border-line bg-paper p-3 text-sm font-black">
                  <span>{resonanceLabel(type)}</span>
                  <span>{count}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
