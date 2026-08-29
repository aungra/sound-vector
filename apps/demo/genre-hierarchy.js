(function installSoundFormGenreHierarchy(global) {
  "use strict";

  const VISUAL_GENRES = Object.freeze([
    "アンビエント", "ドローン", "ノイズミュージック", "電子音楽", "テクノ", "ハウス",
    "ディープ・ハウス", "トランス", "ドラムンベース", "ダブステップ", "チップチューン",
    "ヒップホップ", "トラップ", "レゲエ", "ダブ", "ブルース", "ロック", "パンク",
    "ハードコア", "メタル", "ジャズ", "ファンク", "ソウルミュージック", "ディスコ",
    "シティ・ポップ", "J-POP", "アニメソング", "クラシック音楽", "オペラ", "フォーク",
    "ラテン", "ワールドミュージック"
  ]);

  const SYSTEM_BY_VISUAL = Object.freeze({
    "アンビエント": "Air", "ドローン": "Air", "ブルース": "Air", "ジャズ": "Air",
    "ソウルミュージック": "Air", "クラシック音楽": "Air", "オペラ": "Air", "フォーク": "Air",
    "電子音楽": "Signal", "テクノ": "Signal", "ハウス": "Signal", "ディープ・ハウス": "Signal",
    "チップチューン": "Signal", "ファンク": "Signal", "ディスコ": "Signal", "シティ・ポップ": "Signal",
    "ドラムンベース": "Bass", "ダブステップ": "Bass", "ヒップホップ": "Bass", "トラップ": "Bass",
    "レゲエ": "Bass", "ダブ": "Bass", "ラテン": "Bass", "ワールドミュージック": "Bass",
    "ノイズミュージック": "Impact", "トランス": "Impact", "ロック": "Impact", "パンク": "Impact",
    "ハードコア": "Impact", "メタル": "Impact", "J-POP": "Impact", "アニメソング": "Impact"
  });

  const MODIFIERS = Object.freeze({
    open: { densityShift: -.08, rotationShift: -2, repetition: .25, angularity: .2 },
    pulse: { densityShift: .04, rotationShift: 1, repetition: .82, angularity: .48 },
    broken: { densityShift: .08, rotationShift: 5, repetition: .68, angularity: .72 },
    impact: { densityShift: .14, rotationShift: 7, repetition: .48, angularity: .9 },
    vocal: { densityShift: -.02, rotationShift: -1, repetition: .42, angularity: .22 },
    cinematic: { densityShift: -.06, rotationShift: 0, repetition: .3, angularity: .28 },
    groove: { densityShift: .03, rotationShift: 3, repetition: .74, angularity: .42 }
  });

  const rows = [
    // Air / acoustic, sustained and score-led vocabularies.
    ["ambient", "アンビエント", "アンビエント", null, "open"],
    ["dark-ambient", "ダーク・アンビエント", "アンビエント", "ドローン", "open"],
    ["new-age", "ニューエイジ", "アンビエント", "クラシック音楽", "open"],
    ["drone", "ドローン", "ドローン", null, "open"],
    ["minimal-drone", "ミニマル・ドローン", "ドローン", "アンビエント", "open"],
    ["electroacoustic", "電子音響音楽", "電子音楽", "クラシック音楽", "broken"],
    ["classical", "クラシック", "クラシック音楽", null, "open"],
    ["baroque", "バロック", "クラシック音楽", "フォーク", "pulse"],
    ["romantic", "ロマン派", "クラシック音楽", "オペラ", "vocal"],
    ["contemporary-classical", "現代音楽", "クラシック音楽", "ノイズミュージック", "broken"],
    ["minimalism", "ミニマル・ミュージック", "クラシック音楽", "テクノ", "pulse"],
    ["chamber-music", "室内楽", "クラシック音楽", "ジャズ", "open"],
    ["symphonic", "交響曲", "クラシック音楽", "オペラ", "cinematic"],
    ["film-score", "映画音楽", "クラシック音楽", "アンビエント", "cinematic"],
    ["opera", "オペラ", "オペラ", null, "vocal"],
    ["choral", "合唱", "オペラ", "クラシック音楽", "vocal"],
    ["requiem", "レクイエム", "オペラ", "ドローン", "vocal"],
    ["art-song", "歌曲", "オペラ", "フォーク", "vocal"],
    ["blues", "ブルース", "ブルース", null, "vocal"],
    ["delta-blues", "デルタ・ブルース", "ブルース", "フォーク", "vocal"],
    ["electric-blues", "エレクトリック・ブルース", "ブルース", "ロック", "groove"],
    ["jazz", "ジャズ", "ジャズ", null, "open"],
    ["bebop", "ビバップ", "ジャズ", "ファンク", "broken"],
    ["free-jazz", "フリー・ジャズ", "ジャズ", "ノイズミュージック", "broken"],
    ["jazz-fusion", "ジャズ・フュージョン", "ジャズ", "ファンク", "groove"],
    ["soul", "ソウル", "ソウルミュージック", null, "vocal"],
    ["r-and-b", "R&B", "ソウルミュージック", "ヒップホップ", "vocal"],
    ["neo-soul", "ネオソウル", "ソウルミュージック", "ジャズ", "vocal"],
    ["gospel", "ゴスペル", "ソウルミュージック", "オペラ", "vocal"],
    ["folk", "フォーク", "フォーク", null, "open"],
    ["singer-songwriter", "シンガーソングライター", "フォーク", "J-POP", "vocal"],
    ["country", "カントリー", "フォーク", "ブルース", "groove"],
    ["bluegrass", "ブルーグラス", "フォーク", "ジャズ", "pulse"],

    // Signal / machine, grid and production-led vocabularies.
    ["electronic", "電子音楽", "電子音楽", null, "pulse"],
    ["idm", "IDM", "電子音楽", "ノイズミュージック", "broken"],
    ["experimental-electronic", "実験電子音楽", "電子音楽", "アンビエント", "broken"],
    ["glitch", "グリッチ", "電子音楽", "ノイズミュージック", "broken"],
    ["industrial", "インダストリアル", "電子音楽", "メタル", "impact"],
    ["techno", "テクノ", "テクノ", null, "pulse"],
    ["detroit-techno", "デトロイト・テクノ", "テクノ", "ソウルミュージック", "pulse"],
    ["minimal-techno", "ミニマル・テクノ", "テクノ", "ドローン", "pulse"],
    ["hard-techno", "ハードテクノ", "テクノ", "ハードコア", "impact"],
    ["acid-techno", "アシッド・テクノ", "テクノ", "電子音楽", "broken"],
    ["house", "ハウス", "ハウス", null, "groove"],
    ["deep-house", "ディープ・ハウス", "ディープ・ハウス", null, "groove"],
    ["progressive-house", "プログレッシブ・ハウス", "ハウス", "トランス", "pulse"],
    ["tech-house", "テック・ハウス", "ハウス", "テクノ", "pulse"],
    ["garage-house", "ガラージ・ハウス", "ハウス", "ソウルミュージック", "groove"],
    ["uk-garage", "UKガラージ", "ハウス", "ドラムンベース", "broken"],
    ["two-step", "2ステップ", "ハウス", "ドラムンベース", "broken"],
    ["trance", "トランス", "トランス", null, "pulse"],
    ["progressive-trance", "プログレッシブ・トランス", "トランス", "ハウス", "pulse"],
    ["psytrance", "サイケデリック・トランス", "トランス", "テクノ", "impact"],
    ["chiptune", "チップチューン", "チップチューン", null, "pulse"],
    ["game-music", "ゲーム音楽", "チップチューン", "J-POP", "cinematic"],
    ["funk", "ファンク", "ファンク", null, "groove"],
    ["disco", "ディスコ", "ディスコ", null, "groove"],
    ["nu-disco", "ニューディスコ", "ディスコ", "ハウス", "groove"],
    ["city-pop", "シティ・ポップ", "シティ・ポップ", null, "groove"],
    ["synthpop", "シンセポップ", "電子音楽", "J-POP", "pulse"],
    ["vaporwave", "ヴェイパーウェイヴ", "シティ・ポップ", "アンビエント", "open"],

    // Bass / break, low-frequency and syncopated vocabularies.
    ["drum-and-bass", "ドラムンベース", "ドラムンベース", null, "broken"],
    ["jungle", "ジャングル", "ドラムンベース", "レゲエ", "broken"],
    ["liquid-dnb", "リキッド・ドラムンベース", "ドラムンベース", "ソウルミュージック", "groove"],
    ["neurofunk", "ニューロファンク", "ドラムンベース", "ファンク", "impact"],
    ["breakbeat", "ブレイクビーツ", "ドラムンベース", "ヒップホップ", "broken"],
    ["big-beat", "ビッグ・ビート", "ドラムンベース", "ロック", "impact"],
    ["dubstep", "ダブステップ", "ダブステップ", null, "impact"],
    ["brostep", "ブロステップ", "ダブステップ", "メタル", "impact"],
    ["grime", "グライム", "ヒップホップ", "電子音楽", "broken"],
    ["hip-hop", "ヒップホップ", "ヒップホップ", null, "groove"],
    ["boom-bap", "ブーンバップ", "ヒップホップ", "ファンク", "groove"],
    ["alternative-hip-hop", "オルタナティブ・ヒップホップ", "ヒップホップ", "電子音楽", "broken"],
    ["conscious-hip-hop", "コンシャス・ヒップホップ", "ヒップホップ", "ソウルミュージック", "vocal"],
    ["trap", "トラップ", "トラップ", null, "impact"],
    ["drill", "ドリル", "トラップ", "ハードコア", "impact"],
    ["reggae", "レゲエ", "レゲエ", null, "groove"],
    ["roots-reggae", "ルーツ・レゲエ", "レゲエ", "フォーク", "groove"],
    ["dancehall", "ダンスホール", "レゲエ", "ヒップホップ", "groove"],
    ["dub", "ダブ", "ダブ", null, "open"],
    ["latin", "ラテン", "ラテン", null, "groove"],
    ["salsa", "サルサ", "ラテン", "ジャズ", "groove"],
    ["reggaeton", "レゲトン", "ラテン", "レゲエ", "groove"],
    ["cumbia", "クンビア", "ラテン", "フォーク", "groove"],
    ["samba", "サンバ", "ラテン", "ファンク", "pulse"],
    ["bossa-nova", "ボサノヴァ", "ラテン", "ジャズ", "open"],
    ["afrobeat", "アフロビート", "ワールドミュージック", "ファンク", "groove"],
    ["afrobeats", "アフロビーツ", "ワールドミュージック", "ヒップホップ", "groove"],
    ["world", "ワールドミュージック", "ワールドミュージック", null, "open"],

    // Impact / amplified, fractured and poster-gesture vocabularies.
    ["noise", "ノイズ", "ノイズミュージック", null, "impact"],
    ["harsh-noise", "ハーシュノイズ", "ノイズミュージック", "ハードコア", "impact"],
    ["power-electronics", "パワーエレクトロニクス", "ノイズミュージック", "電子音楽", "impact"],
    ["rock", "ロック", "ロック", null, "impact"],
    ["alternative-rock", "オルタナティブ・ロック", "ロック", "パンク", "broken"],
    ["indie-rock", "インディー・ロック", "ロック", "フォーク", "open"],
    ["post-punk", "ポストパンク", "ロック", "パンク", "broken"],
    ["shoegaze", "シューゲイズ", "ロック", "アンビエント", "open"],
    ["britpop", "ブリットポップ", "ロック", "J-POP", "vocal"],
    ["psychedelic-rock", "サイケデリック・ロック", "ロック", "電子音楽", "broken"],
    ["garage-rock", "ガレージ・ロック", "ロック", "パンク", "impact"],
    ["dance-rock", "ダンス・ロック", "ロック", "ファンク", "groove"],
    ["punk", "パンク", "パンク", null, "impact"],
    ["proto-punk", "プロトパンク", "パンク", "ロック", "impact"],
    ["hardcore-punk", "ハードコア・パンク", "ハードコア", "パンク", "impact"],
    ["post-hardcore", "ポスト・ハードコア", "ハードコア", "ロック", "broken"],
    ["emo", "エモ", "パンク", "J-POP", "vocal"],
    ["metal", "メタル", "メタル", null, "impact"],
    ["heavy-metal", "ヘヴィメタル", "メタル", "ロック", "impact"],
    ["thrash-metal", "スラッシュメタル", "メタル", "ハードコア", "impact"],
    ["death-metal", "デスメタル", "メタル", "ノイズミュージック", "impact"],
    ["black-metal", "ブラックメタル", "メタル", "ドローン", "impact"],
    ["doom-metal", "ドゥームメタル", "メタル", "ドローン", "open"],
    ["sludge-metal", "スラッジメタル", "メタル", "ハードコア", "impact"],
    ["metalcore", "メタルコア", "メタル", "ハードコア", "impact"],
    ["hard-rock", "ハードロック", "ロック", "メタル", "impact"],
    ["j-pop", "J-POP", "J-POP", null, "vocal"],
    ["k-pop", "K-POP", "J-POP", "電子音楽", "vocal"],
    ["anime-song", "アニメソング", "アニメソング", null, "impact"],
    ["pop-rock", "ポップ・ロック", "J-POP", "ロック", "vocal"],
    ["power-pop", "パワーポップ", "J-POP", "ロック", "impact"]
  ];

  const DETAIL_GENRES = Object.freeze(rows.map(([id, label, primary, secondary, modifier], rowIndex) => {
    const siblings = rows.filter(row => row[2] === primary);
    const dialectIndex = siblings.findIndex(row => row[0] === id);
    return Object.freeze({
      id, label, primaryVisualGenre: primary, secondaryVisualGenre: secondary || "",
      system: SYSTEM_BY_VISUAL[primary], modifierId: modifier,
      dialectIndex, dialectCount: siblings.length, vocabularyIndex: rowIndex,
      modifier: Object.freeze({ ...(MODIFIERS[modifier] || MODIFIERS.open) })
    });
  }));
  const DETAIL_BY_ID = Object.freeze(Object.fromEntries(DETAIL_GENRES.map(item => [item.id, item])));
  const GENERIC_BY_VISUAL = Object.freeze(Object.fromEntries(DETAIL_GENRES
    .filter(item => item.label === item.primaryVisualGenre)
    .map(item => [item.primaryVisualGenre, item.id])));

  function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function metric(...values) {
    const value = values.find(item => item !== null && item !== undefined && item !== "" && Number.isFinite(Number(item)));
    return value === undefined ? Number.NaN : Number(value);
  }

  function normalizedTop(analysis) {
    return (Array.isArray(analysis?.top) ? analysis.top : [])
      .map(item => ({ name: item.name || item.label || "", score: clamp(item.score, 0, 100) }))
      .filter(item => VISUAL_GENRES.includes(item.name));
  }

  function externalDetailCandidates(features) {
    const embedding = features?.embeddingGenrePrediction || {};
    const sources = [
      features?.detailedGenrePrediction?.top,
      embedding?.detailedGenre?.top,
      embedding?.detailTop
    ];
    const rows = sources.find(Array.isArray) || [];
    return rows.map(item => {
      const id = String(item.id || item.genre || item.label || "").trim().toLowerCase();
      const detail = DETAIL_BY_ID[id];
      return detail ? { ...detail, score: clamp(item.score, 0, 100), evidence: "model" } : null;
    }).filter(Boolean).sort((a, b) => b.score - a.score);
  }

  function ruleDetailCandidate(parent, parentScore, features, vector) {
    const tempo = metric(vector.tempo, features?.tempo);
    const distortion = metric(vector.distortion, features?.distortion);
    const sustain = metric(vector.sustainRatio, features?.sustainRatio);
    const breakbeat = metric(vector.breakbeatDensity, features?.breakbeatDensity);
    const irregularity = metric(vector.breakbeatIrregularity, features?.breakbeatIrregularity);
    const four = metric(vector.fourOnFloor, features?.fourOnFloor);
    const syncopation = metric(vector.syncopation, features?.syncopation);
    const speech = metric(features?.japaneseVocalEvidence?.speechRapLikelihood);
    const vocal = metric(features?.japaneseVocalEvidence?.vocalPresence);
    const energy = metric(vector.energy, features?.energy);
    const acoustic = metric(vector.acousticness, features?.acousticness);
    let id = "";
    if (["ロック", "パンク"].includes(parent) && syncopation >= .52 && distortion < .48 && four < .42) id = "post-punk";
    else if (parent === "ロック" && distortion >= .55 && sustain >= .62 && breakbeat < .45) id = "shoegaze";
    else if (parent === "ロック" && distortion < .38 && energy < .72) id = "indie-rock";
    else if (parent === "テクノ" && tempo >= 145 && energy >= .72) id = "hard-techno";
    else if (["ハウス", "電子音楽"].includes(parent) && tempo >= 124 && tempo <= 142 && four < .55 && irregularity >= .48) id = "uk-garage";
    else if (parent === "ドラムンベース" && tempo >= 155 && breakbeat >= .58) id = "jungle";
    else if (["ヒップホップ", "電子音楽"].includes(parent) && speech >= .62 && tempo >= 125 && tempo <= 150) id = "grime";
    else if (parent === "ソウルミュージック" && vocal >= .55 && syncopation >= .42 && energy < .72) id = "neo-soul";
    else if (parent === "フォーク" && acoustic >= .62 && distortion < .22 && tempo >= 88) id = "country";
    else if (["ラテン", "レゲエ"].includes(parent) && tempo >= 84 && tempo <= 112 && syncopation >= .58) id = "reggaeton";
    else if (parent === "メタル" && tempo >= 155 && breakbeat >= .42) id = "thrash-metal";
    if (!id || !DETAIL_BY_ID[id]) return null;
    return { ...DETAIL_BY_ID[id], score: clamp(parentScore + 8, 0, 92), evidence: "audio-rule" };
  }

  function stringHash(value) {
    let hash = 2166136261;
    for (const character of String(value || "")) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function visualDialectCandidate(parent, top, features, vector) {
    const choices = DETAIL_GENRES.filter(item => item.primaryVisualGenre === parent);
    if (!choices.length) return null;
    const value = (name, fallback = .5) => {
      const candidate = metric(vector?.[name], features?.[name]);
      return Number.isFinite(candidate) ? clamp(candidate) : fallback;
    };
    const energy = value("energy");
    const onset = value("onset");
    const rhythm = value("rhythm");
    const bass = value("bass");
    const brightness = value("brightness");
    const distortion = value("distortion", .35);
    const sustain = value("sustainRatio", .5);
    const syncopation = value("syncopation", rhythm);
    const irregularity = value("breakbeatIrregularity", onset);
    const four = value("fourOnFloor", rhythm);
    const acoustic = value("acousticness", 1 - distortion);
    const vocal = clamp(metric(features?.japaneseVocalEvidence?.vocalPresence, features?.vocalPresence) || 0);
    const tempo = clamp((metric(vector?.tempo, features?.tempo) - 55) / 145);
    const chroma = Array.isArray(features?.chroma) ? features.chroma : [];
    const chromaPull = chroma.reduce((sum, item, index) => sum + clamp(item) * (index + 1), 0) / 78;
    const audioSignature = energy * 1.7 + onset * 2.3 + rhythm * 2.9 + bass * 3.7
      + brightness * 4.1 + distortion * 4.7 + sustain * 5.3 + syncopation * 5.9
      + irregularity * 6.1 + four * 6.7 + acoustic * 7.1 + vocal * 7.7 + tempo * 8.3 + chromaPull * 9.1;
    const compatibility = modifierId => {
      if (modifierId === "pulse") return rhythm * .34 + four * .28 + tempo * .2 + onset * .18;
      if (modifierId === "broken") return irregularity * .34 + onset * .27 + brightness * .2 + (1 - four) * .19;
      if (modifierId === "impact") return energy * .31 + distortion * .29 + onset * .25 + bass * .15;
      if (modifierId === "vocal") return vocal * .36 + sustain * .28 + (1 - irregularity) * .2 + energy * .16;
      if (modifierId === "cinematic") return sustain * .32 + (1 - four) * .22 + brightness * .18 + energy * .28;
      if (modifierId === "groove") return syncopation * .31 + rhythm * .27 + bass * .24 + (1 - irregularity) * .18;
      return acoustic * .25 + sustain * .25 + (1 - onset) * .2 + (1 - distortion) * .16 + (1 - four) * .14;
    };
    return choices.map((detail, index) => {
      const secondaryScore = detail.secondaryVisualGenre
        ? (top.find(item => item.name === detail.secondaryVisualGenre)?.score || 0) / 100
        : 0;
      const identity = stringHash(detail.id) / 0xffffffff;
      const timbreAffinity = .5 + Math.sin(audioSignature * (1.3 + identity * 2.7) + identity * 19 + index * .73) * .5;
      const genericPenalty = detail.label === detail.primaryVisualGenre && choices.length > 1 ? .13 : 0;
      const score = compatibility(detail.modifierId) * .58 + secondaryScore * .24 + timbreAffinity * .18 - genericPenalty;
      return { ...detail, score, evidence: "audio-visual-dialect" };
    }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))[0];
  }

  function visualBlendFromParents(top, limit = 3) {
    const selected = top.slice(0, limit);
    const total = selected.reduce((sum, item) => sum + item.score, 0) || 1;
    return selected.map(item => ({
      genre: item.name, weight: Math.round(item.score / total * 1000) / 1000,
      system: SYSTEM_BY_VISUAL[item.name]
    }));
  }

  function visualBlendFromDetail(detail) {
    const secondary = detail.secondaryVisualGenre;
    return secondary
      ? [
          { genre: detail.primaryVisualGenre, weight: .68, system: SYSTEM_BY_VISUAL[detail.primaryVisualGenre] },
          { genre: secondary, weight: .32, system: SYSTEM_BY_VISUAL[secondary] }
        ]
      : [{ genre: detail.primaryVisualGenre, weight: 1, system: SYSTEM_BY_VISUAL[detail.primaryVisualGenre] }];
  }

  function classify({ analysis = {}, features = {}, vector = {} } = {}) {
    const top = normalizedTop(analysis);
    const parent = top[0]?.name || "";
    const parentScore = top[0]?.score || 0;
    const margin = parentScore - (top[1]?.score || 0);
    const external = externalDetailCandidates(features)
      .filter(item => !parent || item.primaryVisualGenre === parent || item.secondaryVisualGenre === parent);
    const ruled = ruleDetailCandidate(parent, parentScore, features, vector);
    const visualDialect = visualDialectCandidate(parent, top, features, vector);
    const genericId = GENERIC_BY_VISUAL[parent];
    const generic = genericId ? { ...DETAIL_BY_ID[genericId], score: parentScore, evidence: "parent" } : null;
    const candidates = [...external, ...(ruled ? [ruled] : []), ...(generic ? [generic] : [])]
      .filter((item, index, list) => list.findIndex(other => other.id === item.id) === index)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const detail = candidates[0] || null;
    const lowConfidence = !parent || analysis.needsReview === true || parentScore < 45 || margin < 6;
    const detailedEvidence = detail && detail.evidence !== "parent" && detail.score >= 50;
    const status = lowConfidence ? "unknown" : detailedEvidence ? "detailed" : "parent-only";
    const visualBlend = status === "detailed" && detail
      ? visualBlendFromDetail(detail)
      : visualBlendFromParents(top);
    return {
      schemaVersion: 2,
      vocabularySize: DETAIL_GENRES.length,
      visualCategoryCount: VISUAL_GENRES.length,
      status,
      unknown: status === "unknown",
      label: status === "unknown" ? "Unknown / 判定保留" : detail?.label || parent || "Unknown / 判定保留",
      confidence: detail?.score || parentScore,
      margin,
      top: candidates.map(item => ({
        id: item.id, label: item.label, score: item.score, evidence: item.evidence,
        primaryVisualGenre: item.primaryVisualGenre,
        secondaryVisualGenre: item.secondaryVisualGenre,
        system: item.system
      })),
      visualBlend,
      visualModifier: detail?.modifier || MODIFIERS.open,
      visualDialect: visualDialect ? {
        id: visualDialect.id,
        label: visualDialect.label,
        primaryVisualGenre: visualDialect.primaryVisualGenre,
        secondaryVisualGenre: visualDialect.secondaryVisualGenre,
        modifierId: visualDialect.modifierId,
        dialectIndex: visualDialect.dialectIndex,
        dialectCount: visualDialect.dialectCount,
        modifier: visualDialect.modifier,
        evidence: visualDialect.evidence
      } : null,
      parentTop: top.slice(0, 3),
      source: detailedEvidence ? detail.evidence : "32-parent-fallback"
    };
  }

  global.SoundFormGenreHierarchy = Object.freeze({
    VISUAL_GENRES,
    SYSTEM_BY_VISUAL,
    DETAIL_GENRES,
    classify
  });
})(globalThis);
