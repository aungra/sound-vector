import fs from "node:fs";
import path from "node:path";

const outDir = path.resolve("images");
fs.mkdirSync(outDir, { recursive: true });

const sheetWidth = 3200;
const sheetHeight = 900;
const panelGap = 28;
const panelW = 600;
const panelH = 760;
const startX = 42;
const startY = 90;
const ink = "#111";

const features = {
  rms: 0.89,
  rhythm: 0.59,
  bass: 1,
  centroidHz: 168,
  tempo: 96,
  onset: 0.42,
  chroma: [0.76, 0.18, 0.34, 0.62, 0.16, 0.44, 0.88, 0.22, 0.38, 0.58, 0.2, 0.5]
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fmt(value) {
  return Number(value).toFixed(2).replace(/\.?0+$/, "");
}

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pcmSeries(count, seedText) {
  const rand = seeded(hashString(seedText));
  const out = [];
  const pulseEvery = 60 / features.tempo;
  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1);
    const beat = Math.sin((t / pulseEvery) * Math.PI * 7.2);
    const bass = Math.sin(t * Math.PI * 2 * 2.0 + 0.4) * features.bass;
    const voice = Math.sin(t * Math.PI * 2 * 7.0 + 1.7) * 0.36;
    const shimmer = Math.sin(t * Math.PI * 2 * 19.0 + 2.2) * 0.18;
    const onset = Math.max(0, Math.sin(t * Math.PI * 2 * 16)) * features.onset * 0.55;
    const noise = (rand() - 0.5) * 0.12;
    out.push(clamp((bass * 0.48 + voice + shimmer + beat * 0.12 + onset + noise) * features.rms, -1, 1));
  }
  return out;
}

function pathFromPoints(points) {
  return points.map((point, index) => `${index ? "L" : "M"}${fmt(point.x)} ${fmt(point.y)}`).join(" ");
}

function line(x1, y1, x2, y2, width = 1, attrs = "") {
  return `<path d="M${fmt(x1)} ${fmt(y1)} L${fmt(x2)} ${fmt(y2)}" fill="none" stroke="${ink}" stroke-width="${fmt(width)}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"${attrs}/>`;
}

function poly(points, width = 1.2, attrs = "") {
  return `<path d="${pathFromPoints(points)}" fill="none" stroke="${ink}" stroke-width="${fmt(width)}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"${attrs}/>`;
}

function circle(cx, cy, r, width = 1.2, attrs = "") {
  return `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r)}" fill="none" stroke="${ink}" stroke-width="${fmt(width)}" vector-effect="non-scaling-stroke"${attrs}/>`;
}

function ellipse(cx, cy, rx, ry, width = 1.2, rotate = 0, attrs = "") {
  const transform = rotate ? ` transform="rotate(${fmt(rotate)} ${fmt(cx)} ${fmt(cy)})"` : "";
  return `<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(rx)}" ry="${fmt(ry)}" fill="none" stroke="${ink}" stroke-width="${fmt(width)}" vector-effect="non-scaling-stroke"${transform}${attrs}/>`;
}

function arrow(x1, y1, x2, y2, width = 3) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 13 + width * 1.9;
  const spread = 0.55;
  const p1 = { x: x2, y: y2 };
  const p2 = { x: x2 - Math.cos(angle - spread) * head, y: y2 - Math.sin(angle - spread) * head };
  const p3 = { x: x2 - Math.cos(angle + spread) * head, y: y2 - Math.sin(angle + spread) * head };
  return `${line(x1, y1, x2, y2, width)}<path d="M${fmt(p1.x)} ${fmt(p1.y)} L${fmt(p2.x)} ${fmt(p2.y)} L${fmt(p3.x)} ${fmt(p3.y)} Z" fill="${ink}" stroke="${ink}" stroke-width="0"/>`;
}

function cross(cx, cy, size, width = 1) {
  return `${line(cx - size, cy, cx + size, cy, width)}${line(cx, cy - size, cx, cy + size, width)}`;
}

function wavePath(x1, y1, x2, y2, samples, amplitude, width, phase = 0, attrs = "") {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const points = [];
  for (let i = 0; i < samples.length; i++) {
    const t = i / Math.max(1, samples.length - 1);
    const pulse = Math.sin(t * Math.PI * 2 * (2 + features.rhythm * 5) + phase) * 0.18;
    const offset = (samples[i] + pulse) * amplitude;
    points.push({ x: x1 + dx * t + nx * offset, y: y1 + dy * t + ny * offset });
  }
  return `<path d="${pathFromPoints(points)}" fill="none" stroke="${ink}" stroke-width="${fmt(width)}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"${attrs}/>`;
}

function lissajous(cx, cy, rx, ry, seedText, width = 1) {
  const rand = seeded(hashString(seedText));
  const points = [];
  const a = 2 + Math.round(features.rhythm * 4);
  const b = 3 + Math.round(features.bass * 3);
  const phase = rand() * Math.PI;
  for (let i = 0; i < 160; i++) {
    const t = (i / 159) * Math.PI * 2;
    points.push({
      x: cx + Math.sin(a * t + phase) * rx,
      y: cy + Math.sin(b * t) * ry
    });
  }
  return poly(points, width);
}

function waveformStrata(x, y, w, rows, seedText, amp = 10, width = 0.7) {
  const paths = [];
  for (let row = 0; row < rows; row++) {
    const samples = pcmSeries(120, `${seedText}-strata-${row}`);
    const yy = y + row * 13;
    paths.push(wavePath(x, yy, x + w, yy, samples, amp * (0.55 + row / rows), width, row * 0.2));
  }
  return `<g data-layer="waveform_strata">${paths.join("")}</g>`;
}

function chromaRays(cx, cy, baseR, maxR, width = 1.2) {
  const rays = features.chroma.map((value, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 12;
    const r2 = baseR + (maxR - baseR) * value;
    return line(
      cx + Math.cos(angle) * baseR,
      cy + Math.sin(angle) * baseR,
      cx + Math.cos(angle) * r2,
      cy + Math.sin(angle) * r2,
      width + value * 0.8
    );
  });
  return `<g data-layer="chroma_constellation">${rays.join("")}${circle(cx, cy, baseR, width)}</g>`;
}

function timeTicks(x1, y1, x2, y2, count, seedText, width = 0.9) {
  const samples = pcmSeries(count, seedText);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const ticks = [];
  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1);
    const cx = x1 + dx * t;
    const cy = y1 + dy * t;
    const tick = 4 + Math.abs(samples[i]) * 20;
    ticks.push(line(cx - nx * tick, cy - ny * tick, cx + nx * tick, cy + ny * tick, width));
  }
  return `<g data-layer="time_axis">${ticks.join("")}</g>`;
}

function wrappedPcmEngine(x, y) {
  const cx = x + panelW * 0.5;
  const cy = y + panelH * 0.44;
  const r = 176;
  const loops = [];
  for (let lane = 0; lane < 18; lane++) {
    const samples = pcmSeries(180, `wrapped-${lane}`);
    const phase = lane * 0.38;
    const points = samples.map((sample, i) => {
      const t = i / (samples.length - 1);
      const angle = t * Math.PI * 2 + phase;
      const ringY = cy + (lane - 8.5) * 9 + Math.sin(angle * 2) * 4;
      const ringRx = r * (0.98 - Math.abs(lane - 8.5) * 0.03);
      return {
        x: cx + Math.cos(angle) * (ringRx + sample * 18),
        y: ringY + Math.sin(angle) * (38 + sample * 8)
      };
    });
    loops.push(poly(points, 0.62 + (lane % 4 === 0 ? 0.3 : 0)));
  }
  const axis = [
    arrow(cx, y + 655, cx, y + 135, 5.8),
    arrow(x + 86, cy + 148, x + 506, cy + 102, 5.4),
    arrow(x + 155, cy - 116, x + 486, cy - 20, 3.4),
    line(cx, cy, x + 492, y + 208, 2.2),
    lissajous(cx, cy, 32, 20, "wrapped-lissajous", 0.9)
  ];
  const onset = Array.from({ length: 18 }, (_, i) => cross(x + 72 + i * 26, y + 630 + Math.sin(i) * 12, 5 + (i % 3), 0.85));
  return `<g data-engine="wrapped_pcm">${ellipse(cx, cy, r, 54, 1.1)}${ellipse(cx, cy, r * 0.74, 128, 0.9, -24)}${axis.join("")}<g data-layer="pcm_wrapped">${loops.join("")}</g>${chromaRays(cx + 2, cy - 4, 22, 72, 0.9)}${waveformStrata(x + 72, y + 674, 456, 6, "wrapped-bottom", 7, 0.55)}${onset.join("")}</g>`;
}

function blackSpineEngine(x, y) {
  const cx = x + panelW * 0.48;
  const top = y + 112;
  const bottom = y + 658;
  const spineSamples = pcmSeries(240, "black-spine-main");
  const spine = [];
  for (let lane = -5; lane <= 5; lane++) {
    spine.push(wavePath(cx + lane * 5, bottom, cx + lane * 2, top, spineSamples, 18 + Math.abs(lane) * 2, lane === 0 ? 6.5 : 1.35, lane * 0.25));
  }
  const sideCarriers = [];
  for (let lane = 0; lane < 16; lane++) {
    const yy = y + 170 + lane * 27;
    const side = lane % 2 ? 1 : -1;
    sideCarriers.push(wavePath(cx, yy, cx + side * (160 + lane * 4), yy + Math.sin(lane) * 18, pcmSeries(78, `spine-side-${lane}`), 8 + lane * 0.35, 0.62, lane));
  }
  const notches = Array.from({ length: 28 }, (_, i) => {
    const yy = top + i * ((bottom - top) / 27);
    const side = i % 2 ? 1 : -1;
    return line(cx + side * 26, yy, cx + side * (48 + (i % 4) * 7), yy + Math.sin(i) * 5, 1.2);
  });
  return `<g data-engine="black_spine">${arrow(cx, bottom + 8, cx, top - 30, 7.2)}${arrow(x + 96, y + 572, x + 504, y + 518, 5.1)}${arrow(x + 138, y + 488, x + 448, y + 180, 3.3)}<g data-layer="bass_spine">${spine.join("")}</g><g data-layer="pcm_side_carriers">${sideCarriers.join("")}</g>${chromaRays(cx + 110, y + 228, 18, 80, 0.9)}${waveformStrata(x + 92, y + 675, 424, 5, "spine-bottom", 6, 0.55)}${notches.join("")}${lissajous(cx - 108, y + 256, 42, 25, "spine-lissajous", 0.95)}</g>`;
}

function carrierStormEngine(x, y) {
  const cx = x + panelW * 0.5;
  const cy = y + panelH * 0.43;
  const storm = [];
  for (let lane = 0; lane < 32; lane++) {
    const angle = -Math.PI * 0.9 + (Math.PI * 1.8 * lane) / 31 + Math.sin(lane) * 0.18;
    const len = 140 + (lane % 8) * 22 + features.rms * 90;
    const x2 = cx + Math.cos(angle) * len;
    const y2 = cy + Math.sin(angle) * len * 0.82;
    const samples = pcmSeries(96, `storm-${lane}`);
    storm.push(wavePath(cx, cy, x2, y2, samples, 10 + (lane % 5) * 2.2, 0.58 + (lane % 7 === 0 ? 0.7 : 0), lane * 0.14));
  }
  const rings = Array.from({ length: 5 }, (_, i) => ellipse(cx, cy, 50 + i * 36, 28 + i * 24, 0.85, i * 11));
  const ticks = timeTicks(x + 82, y + 674, x + 518, y + 638, 64, "storm-time", 0.75);
  const onset = Array.from({ length: 24 }, (_, i) => {
    const angle = (i / 24) * Math.PI * 2;
    const rr = 224 + (i % 4) * 10;
    return cross(cx + Math.cos(angle) * rr, cy + Math.sin(angle) * rr * 0.72, 4 + (i % 2) * 2, 0.75);
  });
  return `<g data-engine="carrier_storm">${arrow(cx, y + 662, cx, y + 132, 4.6)}${arrow(x + 82, cy + 116, x + 520, cy - 44, 4.8)}${arrow(x + 140, y + 584, x + 490, y + 198, 3.1)}${rings.join("")}<g data-layer="pcm_carrier_storm">${storm.join("")}</g>${chromaRays(cx, cy, 14, 72, 0.8)}${ticks}${onset.join("")}${lissajous(cx, cy, 44, 30, "storm-lissajous", 1.1)}</g>`;
}

function vectorFlagEngine(x, y) {
  const a = { x: x + 92, y: y + 258 };
  const b = { x: x + 512, y: y + 166 };
  const c = { x: x + 476, y: y + 530 };
  const d = { x: x + 132, y: y + 622 };
  const lerp = (p, q, t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  const cloth = [poly([a, b, c, d, a], 2.8)];
  for (let lane = 0; lane < 18; lane++) {
    const t = (lane + 0.5) / 18;
    const left = lerp(a, d, t);
    const right = lerp(b, c, t);
    cloth.push(wavePath(left.x, left.y, right.x, right.y, pcmSeries(120, `flag-${lane}`), 12 + lane * 0.25, lane % 5 === 0 ? 1.2 : 0.62, lane * 0.33));
  }
  for (let lane = 0; lane < 9; lane++) {
    const t = lane / 8;
    const top = lerp(a, b, t);
    const bottom = lerp(d, c, t);
    cloth.push(wavePath(top.x, top.y, bottom.x, bottom.y, pcmSeries(72, `flag-vertical-${lane}`), 8, 0.55, lane));
  }
  const pole = [
    arrow(a.x - 18, y + 668, a.x - 18, y + 154, 5.2),
    line(a.x - 18, a.y, a.x + 12, a.y, 2.4),
    line(a.x - 18, d.y, d.x, d.y, 2.4)
  ];
  const edgeNotches = Array.from({ length: 22 }, (_, i) => {
    const p = lerp(d, c, i / 21);
    return cross(p.x, p.y + 18 + Math.sin(i) * 8, 4 + (i % 3), 0.8);
  });
  return `<g data-engine="vector_flag">${pole.join("")}<g data-layer="time_pcm_flag">${cloth.join("")}</g>${arrow(x + 94, y + 654, x + 520, y + 580, 4.6)}${arrow(x + 154, y + 214, x + 496, y + 190, 3.4)}${chromaRays(x + 426, y + 236, 16, 66, 0.82)}${lissajous(x + 240, y + 420, 48, 29, "flag-lissajous", 0.85)}${edgeNotches.join("")}</g>`;
}

function compositeStrikeEngine(x, y) {
  const cx = x + panelW * 0.48;
  const cy = y + panelH * 0.46;
  const strikeAngle = -0.62;
  const start = { x: x + 100, y: y + 604 };
  const end = { x: x + 510, y: y + 214 };
  const strike = [];
  for (let lane = -7; lane <= 7; lane++) {
    const offset = lane * 7.4;
    strike.push(wavePath(start.x + offset * 0.7, start.y + offset, end.x + offset * 0.15, end.y + offset * 0.6, pcmSeries(160, `strike-${lane}`), 9 + Math.abs(lane) * 0.9, lane === 0 ? 4.8 : 0.72, lane * 0.19));
  }
  const orbit = [];
  for (let i = 0; i < 4; i++) {
    orbit.push(ellipse(cx, cy, 96 + i * 38, 48 + i * 20, 0.95, -35 + i * 12));
  }
  const hatch = [];
  for (let i = 0; i < 24; i++) {
    const t = i / 23;
    const baseX = x + 96 + t * 418;
    const baseY = y + 180 + Math.sin(t * Math.PI * 3) * 58 + t * 330;
    hatch.push(line(baseX - 34, baseY + 20, baseX + 50, baseY - 26, i % 6 === 0 ? 1.25 : 0.58));
  }
  return `<g data-engine="composite_strike">${arrow(x + 74, y + 644, x + 520, y + 604, 5.3)}${arrow(cx, y + 668, cx, y + 122, 4.9)}${arrow(x + 142, y + 540, x + 500, y + 214, 4.2)}${orbit.join("")}<g data-layer="r_composite_pcm">${strike.join("")}</g><g data-layer="texture_hatching">${hatch.join("")}</g>${timeTicks(x + 118, y + 690, x + 520, y + 662, 64, "strike-time", 0.66)}${chromaRays(end.x - 22, end.y + 16, 18, 82, 0.86)}${lissajous(cx - 22, cy + 18, 54, 32, "strike-lissajous", 1.05)}</g>`;
}

const engines = [
  ["01 Wrapped PCM", wrappedPcmEngine],
  ["02 Black Spine", blackSpineEngine],
  ["03 Carrier Storm", carrierStormEngine],
  ["04 Vector Flag", vectorFlagEngine],
  ["05 Composite Strike", compositeStrikeEngine]
];

function panelFrame(x, y, label) {
  return `<g data-layer="panel_frame"><text x="${fmt(x + 2)}" y="${fmt(y - 14)}" font-family="Helvetica, Arial, sans-serif" font-size="20" letter-spacing=".04em" fill="${ink}">${label}</text><rect x="${fmt(x)}" y="${fmt(y)}" width="${panelW}" height="${panelH}" fill="#fff" stroke="${ink}" stroke-width="1.2"/></g>`;
}

function singleSvg(label, engine) {
  const padX = 20;
  const padY = 56;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${panelW + padX * 2} ${panelH + padY * 2}">
  <rect width="100%" height="100%" fill="#fff"/>
  ${panelFrame(padX, padY, label)}
  <g data-layer="sound_vector_engine">${engine(padX, padY)}</g>
</svg>`;
}

function compositeSvg() {
  const defs = `<defs><style><![CDATA[text{paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round}.small{font-family:Helvetica,Arial,sans-serif;font-size:16px;letter-spacing:.04em;fill:${ink}}]]></style></defs>`;
  const panels = engines.map(([label, engine], index) => {
    const x = startX + index * (panelW + panelGap);
    const y = startY;
    return `<g data-panel="${label.replace(/\s+/g, "-").toLowerCase()}">${panelFrame(x, y, label)}<g data-layer="sound_vector_engine">${engine(x, y)}</g></g>`;
  }).join("");
  const notes = [
    "same audio input / different generation engines",
    "RMS 89%  Rhythm 59%  Bass 100%  Tempo 96BPM  Onset 42%",
    "visible carriers can vary; reversible PCM stays protected outside the editable drawing"
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sheetWidth} ${sheetHeight}">
  ${defs}
  <rect width="100%" height="100%" fill="#fff"/>
  <text x="42" y="32" class="small">${notes.join(" / ")}</text>
  ${panels}
</svg>`;
}

for (const [label, engine] of engines) {
  const safe = label.toLowerCase().replace(/^\d+\s+/, "").replace(/\s+/g, "-");
  fs.writeFileSync(path.join(outDir, `sound-vector-engine-${safe}.svg`), singleSvg(label, engine));
}

fs.writeFileSync(path.join(outDir, "sound-vector-engine-5up.svg"), compositeSvg());
console.log(path.join(outDir, "sound-vector-engine-5up.svg"));
