#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_REVISION = "2026-08-23-track-boundary-reranker-v97";

function label(item) {
  return String(item?.label || item?.name || "");
}

function prediction(payload) {
  return payload?.features?.embeddingGenrePrediction || {};
}

function richParity(payload) {
  const features = payload?.features || {};
  return payload?.ok === true
    && features.classificationScope === "track"
    && Array.isArray(features.sampledRanges) && features.sampledRanges.length >= 4
    && features.japaneseVocalEvidence?.available === true
    && Array.isArray(prediction(payload).unknownSourceConsensus?.top)
    && prediction(payload).unknownSourceConsensus.top.length > 0;
}

async function analyze(endpoint, fixture, fetchImpl) {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://aun-graphic.jp" },
    body: JSON.stringify({
      action: "analyze-youtube",
      requestId: `shadow-${fixture.id}-${crypto.randomUUID()}`,
      genreInferenceRevision: CLIENT_REVISION,
      youtubeUrl: fixture.youtubeUrl,
      originalYoutubeUrl: fixture.youtubeUrl,
      startSeconds: Number(fixture.startSeconds || 0),
      features: ["tempo", "rms", "spectralCentroid", "chroma", "onsets", "stereoPhase", "bassEnergy"],
    }),
  });
  const payload = await response.json();
  if (!response.ok || payload.ok !== true) throw new Error(`${fixture.id}: HTTP ${response.status} ${payload.code || "analysis-failed"}`);
  return payload;
}

export async function compareCloudParity({ macEndpoint, cloudEndpoint, fixtures, fetchImpl = fetch, scoreTolerance = 1.5 }) {
  const rows = [];
  for (const fixture of fixtures) {
    const mac = await analyze(macEndpoint, fixture, fetchImpl);
    const cloud = await analyze(cloudEndpoint, fixture, fetchImpl);
    const macTop = prediction(mac).top || [];
    const cloudTop = prediction(cloud).top || [];
    const compared = Math.min(3, macTop.length, cloudTop.length);
    const maximumScoreDelta = Math.max(0, ...Array.from({ length: compared }, (_, index) => (
      Math.abs(Number(macTop[index]?.score || 0) - Number(cloudTop[index]?.score || 0))
    )));
    const sameTop3 = compared >= 3
      && macTop.slice(0, 3).map(label).join("|") === cloudTop.slice(0, 3).map(label).join("|");
    const expectedPass = !fixture.expectedLabel || label(cloudTop[0]) === fixture.expectedLabel;
    const passes = richParity(mac) && richParity(cloud) && sameTop3
      && maximumScoreDelta <= scoreTolerance && expectedPass;
    rows.push({
      id: fixture.id,
      passes,
      macTop: macTop.slice(0, 3),
      cloudTop: cloudTop.slice(0, 3),
      maximumScoreDelta: Math.round(maximumScoreDelta * 1000) / 1000,
      richParity: { mac: richParity(mac), cloud: richParity(cloud) },
      expectedLabel: fixture.expectedLabel || "",
      expectedPass,
      macModelVersion: mac.features?.modelVersion || prediction(mac).modelVersion || "",
      cloudModelVersion: cloud.features?.modelVersion || prediction(cloud).modelVersion || "",
    });
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    clientRevision: CLIENT_REVISION,
    scoreTolerance,
    fixtureCount: rows.length,
    passedCount: rows.filter(row => row.passes).length,
    passes: rows.length >= 4 && rows.every(row => row.passes),
    rows,
    audioRetained: false,
  };
}

function valueAfter(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const macEndpoint = valueAfter("--mac-endpoint");
  const cloudEndpoint = valueAfter("--cloud-endpoint");
  const fixturesPath = path.resolve(valueAfter("--fixtures") || path.join(SCRIPT_DIR, "cloud-shadow-fixtures.json"));
  const outputPath = valueAfter("--output");
  if (!macEndpoint || !cloudEndpoint || !outputPath) {
    throw new Error("--mac-endpoint, --cloud-endpoint and --output are required.");
  }
  const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf8")).fixtures || [];
  const report = await compareCloudParity({ macEndpoint, cloudEndpoint, fixtures });
  fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(JSON.stringify({ passes: report.passes, passed: report.passedCount, total: report.fixtureCount }) + "\n");
  if (!report.passes) process.exitCode = 1;
}
