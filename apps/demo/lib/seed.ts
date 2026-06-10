import type { Creator, ResonanceType, Tshirt } from "./types";

export const resonanceLabels: Record<ResonanceType, string> = {
  remembered: "思い出した",
  heard: "聴こえた",
  worn: "着ていた気がする",
  strangely_familiar: "知らないのに懐かしい",
  body_reacted: "身体が反応した"
};

export const questions = [
  {
    id: "place",
    title: "その音楽は、どこで鳴っていましたか？",
    options: ["港", "ライブハウス", "クラブ", "教会", "路面電車", "坂道", "部屋", "祭り"]
  },
  {
    id: "time",
    title: "記憶に近い時間帯は？",
    options: ["朝方", "昼", "夕方", "夜", "深夜", "雨の日"]
  },
  {
    id: "body",
    title: "身体にはどう残っていますか？",
    options: ["低音", "手拍子", "声", "足音", "湿度", "静けさ", "揺れ"]
  },
  {
    id: "feeling",
    title: "その時の感情に近いものは？",
    options: ["ひとり", "友人", "家族", "初恋", "喪失", "祈り", "高揚", "帰り道"]
  },
  {
    id: "cloth",
    title: "服の記憶はどんな感触ですか？",
    options: ["汗", "雨", "古着", "制服", "黒い服", "白い布", "ジャケット", "素肌"]
  }
];

export const creators: Creator[] = [
  {
    id: "c-01",
    name: "Rina Kawahara",
    profile: "長崎の坂道と夜の店先を採集するグラフィックデザイナー。",
    sns: "@rina.delta"
  },
  {
    id: "c-02",
    name: "Masato Ide",
    profile: "港、車窓、家族のラジオから服の絵柄を起こすクリエイター。",
    sns: "@ide_line"
  },
  {
    id: "c-03",
    name: "Haru Onizuka",
    profile: "聖堂、祭り、電子音の距離を布に翻訳するアーティスト。",
    sns: "@haru.doh"
  }
];

export const tshirts: Tshirt[] = [
  {
    id: "t-01",
    creatorId: "c-01",
    title: "Rain After Bass",
    description: "クラブを出た朝方、雨で冷えたTシャツに低音だけが残っていた記憶。",
    image: "images/t-01.svg",
    location: "Wall A / 入口左",
    price: "6,600 yen",
    stockNote: "会場受注 / M-L-XL",
    tags: ["クラブ", "朝方", "雨", "低音", "友人", "汗", "高揚"],
    tracks: [
      { id: "t-01-01", title: "After Floor", artist: "Imaginary Port", comment: "床の振動だけ覚えている曲。", tags: ["クラブ", "低音", "朝方"] },
      { id: "t-01-02", title: "Wet Neon", artist: "Saka-Machi", comment: "外に出た瞬間の雨。", tags: ["雨", "夜", "帰り道"] },
      { id: "t-01-03", title: "Last Friend", artist: "Delta Loop", comment: "友人の肩越しに聴いた声。", tags: ["友人", "声", "高揚"] },
      { id: "t-01-04", title: "Smoke Door", artist: "North Pier", comment: "扉を開けた瞬間だけ音が細くなる。", tags: ["クラブ", "夜", "静けさ"] },
      { id: "t-01-05", title: "Taxi Line", artist: "Machi Echo", comment: "帰る人の列に残るキック。", tags: ["帰り道", "低音", "朝方"] },
      { id: "t-01-06", title: "Red Stamp", artist: "Floor Receipt", comment: "手首のスタンプと汗。", tags: ["汗", "高揚", "黒い服"] },
      { id: "t-01-07", title: "Rain Cable", artist: "Delta Cable", comment: "濡れたケーブルみたいなシンセ。", tags: ["雨", "低音", "夜"] },
      { id: "t-01-08", title: "Outside Voice", artist: "Exit Choir", comment: "外の声が急に大きい。", tags: ["声", "友人", "朝方"] },
      { id: "t-01-09", title: "One More", artist: "Last Token", comment: "もう一曲だけ、の記憶。", tags: ["クラブ", "高揚", "深夜"] },
      { id: "t-01-10", title: "Dry Cotton", artist: "After Rain", comment: "乾いていく布に残る低音。", tags: ["雨", "汗", "低音"] }
    ]
  },
  {
    id: "t-02",
    creatorId: "c-02",
    title: "Father's Radio Shirt",
    description: "港へ向かう車の中、曲名を知らないまま身体に残った家族のラジオ。",
    image: "images/t-02.svg",
    location: "Table B / 中央",
    price: "5,900 yen",
    stockNote: "現品販売 / Lのみ",
    tags: ["港", "昼", "家族", "車", "ラジオ", "白い布", "帰り道"],
    tracks: [
      { id: "t-02-01", title: "AM Window", artist: "Harbor Static", comment: "窓とラジオが同じ速度で流れる。", tags: ["港", "家族", "昼"] },
      { id: "t-02-02", title: "Unknown Chorus", artist: "Nami Records", comment: "知らないのに歌えるサビ。", tags: ["声", "家族", "白い布"] },
      { id: "t-02-03", title: "Return Route", artist: "Route 202", comment: "帰り道にだけ少し寂しい。", tags: ["帰り道", "夕方", "喪失"] },
      { id: "t-02-04", title: "Seat Belt Song", artist: "Family Van", comment: "シートベルトの音から始まる。", tags: ["家族", "車", "昼"] },
      { id: "t-02-05", title: "White Sleeve", artist: "Cotton Dial", comment: "白い袖に日差しが落ちる。", tags: ["白い布", "港", "昼"] },
      { id: "t-02-06", title: "Ferry Horn", artist: "Harbor Static", comment: "曲の途中に船の音が混ざる。", tags: ["港", "声", "静けさ"] },
      { id: "t-02-07", title: "Old Preset", artist: "Radio Memory", comment: "父の車だけで鳴る音質。", tags: ["家族", "ラジオ", "古着"] },
      { id: "t-02-08", title: "Backseat Heat", artist: "Route 202", comment: "後部座席の熱が服に残る。", tags: ["家族", "汗", "昼"] },
      { id: "t-02-09", title: "Almost Home", artist: "Nami Records", comment: "家に着く前だけ曲が良く聴こえる。", tags: ["帰り道", "家族", "夕方"] },
      { id: "t-02-10", title: "No Title", artist: "Unknown Chorus", comment: "曲名を知らないまま大事になった。", tags: ["知らないのに懐かしい", "声", "ラジオ"] }
    ]
  },
  {
    id: "t-03",
    creatorId: "c-03",
    title: "Procession Echo",
    description: "祭囃子と聖堂の残響が同じ街で重なる、長崎らしい祈りの服。",
    image: "images/t-03.svg",
    location: "Wall C / スクリーン横",
    price: "7,200 yen",
    stockNote: "会場受注 / S-M-L",
    tags: ["祭り", "教会", "祈り", "手拍子", "声", "黒い服", "夜"],
    tracks: [
      { id: "t-03-01", title: "Bell and Drum", artist: "DoH Ensemble", comment: "鐘と太鼓が遠くで混ざる。", tags: ["教会", "祭り", "祈り"] },
      { id: "t-03-02", title: "Black Cotton", artist: "Nagasaki Room", comment: "黒い服で静かに立っていた夜。", tags: ["黒い服", "夜", "静けさ"] },
      { id: "t-03-03", title: "Hands Passing", artist: "Machi No Oto", comment: "手拍子が人から人へ移る。", tags: ["手拍子", "声", "高揚"] },
      { id: "t-03-04", title: "Stone Nave", artist: "DoH Ensemble", comment: "石の壁に残る低い響き。", tags: ["教会", "祈り", "低音"] },
      { id: "t-03-05", title: "Festival Rain", artist: "Machi No Oto", comment: "雨でも太鼓は止まらない。", tags: ["祭り", "雨", "手拍子"] },
      { id: "t-03-06", title: "Candle Route", artist: "Nagasaki Room", comment: "灯りの列を追いながら聴く。", tags: ["祈り", "夜", "帰り道"] },
      { id: "t-03-07", title: "Voice Above", artist: "Bell Choir", comment: "上から落ちてくる声。", tags: ["声", "教会", "静けさ"] },
      { id: "t-03-08", title: "Cotton Procession", artist: "DoH Ensemble", comment: "黒い布が列になって動く。", tags: ["黒い服", "祭り", "揺れ"] },
      { id: "t-03-09", title: "Between Bells", artist: "Bell Choir", comment: "鐘と鐘の間の無音。", tags: ["教会", "静けさ", "祈り"] },
      { id: "t-03-10", title: "After Hands", artist: "Machi No Oto", comment: "手拍子が終わった後の手の熱。", tags: ["手拍子", "身体が反応した", "高揚"] }
    ]
  }
];
