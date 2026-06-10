import fs from "node:fs";
import vm from "node:vm";

const htmlPath = new URL("../MUSIC MEMORY FITTING ROOM.html", import.meta.url);
const html = fs.readFileSync(htmlPath, "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

const sandbox = {
  console,
  setInterval() { return 1; },
  clearInterval() {},
  Date,
  Math,
  URL,
  window: {},
  crypto: { randomUUID() { return "preview-session"; } },
  fetch: async () => { throw new Error("preview offline"); },
  localStorage: { getItem() { return null; }, setItem() {} },
  scrollTo() {},
  document: {
    getElementById(id) {
      return id === "app" ? { set innerHTML(value) { this.html = value; }, get innerHTML() { return this.html || ""; } } : { value: "", files: [] };
    }
  }
};

vm.createContext(sandbox);
vm.runInContext(script, sandbox);

const examples = [
  {
    label: "r = RMS / DISTANCE",
    file: "example-r-radius.wav",
    features: {
      source: "preview-real-analysis-shape",
      tempo: 86,
      energy: .96,
      bass: .02,
      brightness: .04,
      rhythm: .04,
      onset: .02,
      spectralCentroid: 820,
      chroma: [.24, .18, .2, .16, .22, .2, .18, .24, .16, .2, .18, .22],
      temporalProfile: [.1, .18, .32, .48, .6, .74, .88, .96, .84, .62, .48, .36, .3, .2, .14, .08],
      phase: .8
    }
  },
  {
    label: "Z WEIGHT = BASS",
    file: "example-bass-z.wav",
    features: {
      source: "preview-real-analysis-shape",
      tempo: 76,
      energy: .08,
      bass: .98,
      brightness: .04,
      rhythm: .04,
      onset: .02,
      spectralCentroid: 640,
      chroma: [.72, .1, .08, .68, .12, .1, .74, .14, .08, .62, .1, .08],
      temporalProfile: [.62, .48, .66, .42, .72, .44, .8, .46, .74, .5, .68, .44, .6, .38, .52, .34],
      phase: 1.1
    }
  },
  {
    label: "theta = CENTROID",
    file: "example-theta-centroid.m4a",
    features: {
      source: "preview-real-analysis-shape",
      tempo: 112,
      energy: .08,
      bass: .02,
      brightness: .98,
      rhythm: .04,
      onset: .02,
      spectralCentroid: 6200,
      chroma: [.1, .22, .18, .2, .24, .16, .18, .2, .22, .18, .24, .2],
      temporalProfile: [.2, .24, .28, .32, .36, .4, .44, .48, .52, .56, .6, .64, .68, .72, .76, .8],
      phase: 2.4
    }
  },
  {
    label: "CHROMA = 12 RAYS",
    file: "example-chroma-cluster.wav",
    features: {
      source: "preview-real-analysis-shape",
      tempo: 104,
      energy: .08,
      bass: .02,
      brightness: .04,
      rhythm: .04,
      onset: .02,
      spectralCentroid: 2600,
      chroma: [.98, .08, .12, .84, .1, .16, .92, .08, .14, .78, .1, .18],
      temporalProfile: [.22, .3, .26, .34, .3, .38, .34, .42, .36, .44, .4, .48, .42, .52, .46, .56],
      phase: 3.2
    }
  },
  {
    label: "ONSET = POINT MARKS",
    file: "example-sharp-onset.mp3",
    features: {
      source: "preview-real-analysis-shape",
      tempo: 128,
      energy: .08,
      bass: .02,
      brightness: .04,
      rhythm: .12,
      onset: .98,
      spectralCentroid: 2800,
      chroma: [.18, .22, .2, .16, .24, .2, .18, .22, .2, .16, .24, .2],
      temporalProfile: [.08, .86, .12, .9, .1, .82, .14, .96, .08, .78, .16, .88, .12, .72, .18, .84],
      phase: 4.4
    }
  },
  {
    label: "T AXIS = TIME",
    file: "example-time-axis.mp3",
    features: {
      source: "preview-real-analysis-shape",
      tempo: 188,
      energy: .08,
      bass: .02,
      brightness: .04,
      rhythm: .92,
      onset: .02,
      spectralCentroid: 2200,
      chroma: [.2, .18, .22, .2, .18, .22, .2, .18, .22, .2, .18, .22],
      temporalProfile: [.08, .18, .12, .34, .16, .5, .22, .68, .28, .84, .34, .72, .42, .58, .5, .36],
      phase: 5.2
    }
  }
];

const cards = examples.map((example, index) => {
  sandbox.previewFeatures = example.features;
  sandbox.previewFileName = example.file;
  sandbox.previewTick = 1717920000000 + index * 98765;
  const svg = vm.runInContext(`
    (() => {
      const features = normaliseFeatures(previewFeatures, previewFileName);
      const mood = createUploadedMood(previewFileName, features);
      return generateRealtimeSvg(mood, previewTick);
    })()
  `, sandbox);
  return `<article class="card"><div class="art">${svg}</div><p>${example.label}</p></article>`;
}).join("");

const preview = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>Audio Pattern Preview</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f6f6f2; color: #111; font-family: Helvetica, Arial, sans-serif; }
    .sheet { width: 1800px; height: 1320px; padding: 56px; display: grid; grid-template-rows: auto 1fr; gap: 34px; }
    header { display: flex; justify-content: space-between; align-items: end; border-bottom: 1px solid rgba(17,17,17,.28); padding-bottom: 22px; }
    h1 { margin: 0; font-size: 54px; line-height: .95; font-weight: 500; letter-spacing: -.04em; }
    header p { margin: 0; font-size: 18px; max-width: 520px; line-height: 1.45; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; }
    .card { background: #fff; border: 1px solid rgba(17,17,17,.24); padding: 24px; display: grid; grid-template-rows: 1fr auto; gap: 18px; }
    .art { aspect-ratio: 1 / 1; border: 1px solid rgba(17,17,17,.16); overflow: hidden; background: #fff; }
    svg { width: 100%; height: 100%; display: block; }
    .card p { margin: 0; font-size: 18px; letter-spacing: .02em; }
  </style>
</head>
<body>
  <main class="sheet">
    <header><h1>REAL AUDIO<br>SPHERICAL + TIME PREVIEW</h1><p>r=RMS、θ=スペクトル重心、φ=テンポ/onset。Z軸の太さは低域、参照点の周囲にクロマ、左奥へ伸びるT軸に時間変化を置きます。</p></header>
    <section class="grid">${cards}</section>
  </main>
</body>
</html>`;

fs.mkdirSync(new URL("../images", import.meta.url), { recursive: true });
fs.writeFileSync(new URL("../images/audio-pattern-preview.html", import.meta.url), preview);
console.log("images/audio-pattern-preview.html");
