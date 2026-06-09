import fs from "node:fs";
import path from "node:path";

const OUT_MODELS = "models";
const OUT_IMAGES = "images";
const INK = "#111";

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function v(x, y, z) {
  return { x, y, z };
}

function add(a, b) {
  return v(a.x + b.x, a.y + b.y, a.z + b.z);
}

function rotZ(p, deg) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return v(p.x * c - p.y * s, p.x * s + p.y * c, p.z);
}

function transformPoint(p, o) {
  const q = rotZ(v(p.x * o.scale.x, p.y * o.scale.y, p.z * o.scale.z), o.rotateZ ?? 0);
  return add(q, o.translate);
}

function normal(face, vertices) {
  const a = vertices[face[0]];
  const b = vertices[face[1]];
  const c = vertices[face[2]];
  const u = v(b.x - a.x, b.y - a.y, b.z - a.z);
  const w = v(c.x - a.x, c.y - a.y, c.z - a.z);
  return v(
    u.y * w.z - u.z * w.y,
    u.z * w.x - u.x * w.z,
    u.x * w.y - u.y * w.x
  );
}

function addMesh(scene, mesh, options) {
  const start = scene.vertices.length;
  mesh.vertices.forEach((point) => scene.vertices.push(transformPoint(point, options)));
  mesh.faces.forEach((face) => scene.faces.push({
    indices: face.map((idx) => idx + start),
    ink: options.ink ?? "auto",
    stroke: options.stroke ?? true
  }));
}

function boxMesh() {
  const vertices = [
    v(-0.5, -0.5, -0.5), v(0.5, -0.5, -0.5), v(0.5, 0.5, -0.5), v(-0.5, 0.5, -0.5),
    v(-0.5, -0.5, 0.5), v(0.5, -0.5, 0.5), v(0.5, 0.5, 0.5), v(-0.5, 0.5, 0.5)
  ];
  const faces = [
    [4, 5, 6, 7], [0, 3, 2, 1],
    [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]
  ];
  return { vertices, faces };
}

function cylinderMesh(segments = 36, cap = true) {
  const vertices = [];
  for (let i = 0; i < segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    vertices.push(v(Math.cos(a) * 0.5, Math.sin(a) * 0.5, -0.5));
  }
  for (let i = 0; i < segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    vertices.push(v(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.5));
  }
  const faces = [];
  for (let i = 0; i < segments; i += 1) {
    const n = (i + 1) % segments;
    faces.push([i, n, n + segments, i + segments]);
  }
  if (cap) {
    faces.push([...Array(segments).keys()].reverse());
    faces.push([...Array(segments).keys()].map((i) => i + segments));
  }
  return { vertices, faces };
}

function ringMesh(segments = 40, inner = 0.55) {
  const vertices = [];
  for (const z of [-0.5, 0.5]) {
    for (let i = 0; i < segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      vertices.push(v(Math.cos(a) * 0.5, Math.sin(a) * 0.5, z));
    }
    for (let i = 0; i < segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      vertices.push(v(Math.cos(a) * 0.5 * inner, Math.sin(a) * 0.5 * inner, z));
    }
  }
  const faces = [];
  const topOuter = segments * 2;
  const topInner = segments * 3;
  const botInner = segments;
  for (let i = 0; i < segments; i += 1) {
    const n = (i + 1) % segments;
    faces.push([i, n, n + topOuter, i + topOuter]);
    faces.push([i + botInner, i + topInner, n + topInner, n + botInner]);
    faces.push([i + topOuter, n + topOuter, n + topInner, i + topInner]);
    faces.push([i, i + botInner, n + botInner, n]);
  }
  return { vertices, faces };
}

function scene() {
  return { vertices: [], faces: [] };
}

function slab(sc, translate, scale, rotateZ = 0) {
  addMesh(sc, boxMesh(), { translate, scale, rotateZ });
}

function cyl(sc, translate, scale, rotateZ = 0) {
  addMesh(sc, cylinderMesh(40), { translate, scale, rotateZ });
}

function ring(sc, translate, scale, rotateZ = 0) {
  addMesh(sc, ringMesh(44, 0.58), { translate, scale, rotateZ });
}

function diamond(sc, translate, size) {
  slab(sc, translate, v(size, size, size * 0.38), 45);
}

function designOne() {
  const sc = scene();
  ring(sc, v(-0.2, 0, 0), v(4.9, 4.9, 0.55), 0);
  slab(sc, v(-1.5, -0.55, 1.35), v(3.1, 2.1, 1.1), -28);
  slab(sc, v(1.55, 0.58, 1.25), v(2.1, 2.2, 1.95), -28);
  cyl(sc, v(2.65, -0.28, 2.2), v(1.28, 1.28, 1.6), 0);
  cyl(sc, v(-0.8, 0.35, 1.9), v(1.35, 1.35, 0.34), 0);
  slab(sc, v(-3.45, 0.8, 0.85), v(0.55, 2.4, 1.9), 0);
  slab(sc, v(3.7, 0.25, 0.85), v(0.48, 2.1, 1.7), 0);
  diamond(sc, v(-4.1, -1.8, 1.1), 0.48);
  diamond(sc, v(0.6, -2.75, 3.15), 0.62);
  diamond(sc, v(3.2, 2.3, 0.95), 0.52);
  return sc;
}

function designTwo() {
  const sc = scene();
  slab(sc, v(-0.8, 0.65, 0), v(4.5, 3.1, 1.0), -28);
  slab(sc, v(-0.1, -0.08, 2.05), v(2.6, 1.9, 3.3), -28);
  ring(sc, v(0.08, -0.2, 3.25), v(1.85, 1.85, 0.48), 0);
  cyl(sc, v(-2.55, 0.02, 2.0), v(0.88, 0.88, 0.72), 0);
  cyl(sc, v(1.92, -0.08, 2.05), v(0.88, 0.88, 0.72), 0);
  ring(sc, v(2.15, 1.55, 0.86), v(2.55, 2.55, 0.42), 0);
  slab(sc, v(-3.65, 0.85, 0.7), v(0.6, 1.8, 1.55), 0);
  slab(sc, v(3.25, -1.65, 1.0), v(0.54, 1.6, 1.2), 0);
  diamond(sc, v(-3.4, -1.9, 2.4), 0.62);
  diamond(sc, v(3.8, 0.8, 1.28), 0.5);
  return sc;
}

function designThree() {
  const sc = scene();
  slab(sc, v(0, 0.9, 0), v(4.8, 3.5, 0.9), -28);
  slab(sc, v(-0.15, 0.52, 1.02), v(3.55, 2.35, 0.85), -28);
  slab(sc, v(-0.2, 0.14, 2.0), v(2.35, 1.5, 0.8), -28);
  slab(sc, v(-0.1, -0.15, 3.18), v(0.95, 1.05, 2.25), -28);
  diamond(sc, v(-0.1, -0.2, 4.7), 0.68);
  slab(sc, v(2.25, -0.55, 2.7), v(1.9, 1.9, 2.05), -28);
  ring(sc, v(2.25, -0.55, 3.08), v(1.22, 1.22, 0.38), 0);
  slab(sc, v(-3.7, 0.2, 1.2), v(0.72, 2.5, 2.05), 0);
  slab(sc, v(-2.75, 0.8, 1.05), v(0.56, 1.9, 1.62), 0);
  slab(sc, v(3.55, 1.28, 1.1), v(0.55, 2.1, 1.75), 0);
  slab(sc, v(4.25, 0.7, 1.0), v(0.48, 1.75, 1.45), 0);
  diamond(sc, v(-3.85, -1.65, 0.95), 0.52);
  diamond(sc, v(3.9, 2.4, 0.95), 0.54);
  return sc;
}

function obj(sc, name) {
  const lines = [`o ${name}`];
  sc.vertices.forEach((p) => lines.push(`v ${p.x.toFixed(4)} ${p.y.toFixed(4)} ${p.z.toFixed(4)}`));
  sc.faces.forEach((face) => lines.push(`f ${face.indices.map((idx) => idx + 1).join(" ")}`));
  return `${lines.join("\n")}\n`;
}

function project(p) {
  const x = (p.x - p.y) * 72;
  const y = (p.x + p.y) * 36 - p.z * 78;
  return { x, y };
}

function shade(face, vertices) {
  const n = normal(face.indices, vertices);
  if (n.z > 0.35) return "white";
  return "black";
}

function svg(sc, title) {
  const projected = sc.vertices.map(project);
  const faces = sc.faces
    .map((face) => {
      const points = face.indices.map((idx) => projected[idx]);
      const depth = face.indices.reduce((sum, idx) => {
        const p = sc.vertices[idx];
        return sum + p.x + p.y + p.z * 0.55;
      }, 0) / face.indices.length;
      return { face, points, depth, shade: shade(face, sc.vertices) };
    })
    .sort((a, b) => a.depth - b.depth);

  const all = projected;
  const minX = Math.min(...all.map((p) => p.x));
  const maxX = Math.max(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y));
  const maxY = Math.max(...all.map((p) => p.y));
  const scale = Math.min(940 / (maxX - minX), 940 / (maxY - minY));
  const tx = 600 - ((minX + maxX) / 2) * scale;
  const ty = 600 - ((minY + maxY) / 2) * scale;
  const pathData = (points) => points.map((p, i) => `${i ? "L" : "M"}${(p.x * scale + tx).toFixed(1)} ${(p.y * scale + ty).toFixed(1)}`).join(" ") + "Z";

  const paths = faces.map(({ points, shade: s }) => {
    const fill = s === "white" ? "#fff" : INK;
    return `<path d="${pathData(points)}" fill="${fill}" stroke="${INK}" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" role="img" aria-labelledby="title desc">
  <title id="title">${title}</title>
  <desc id="desc">Generated from OBJ-style geometric primitives, one black ink with white negative space.</desc>
  ${paths.join("\n  ")}
</svg>
`;
}

const designs = [
  ["t-01", "Rain After Bass", designOne()],
  ["t-02", "Father's Radio Shirt", designTwo()],
  ["t-03", "Procession Echo", designThree()]
];

ensureDir(OUT_MODELS);
ensureDir(OUT_IMAGES);

for (const [id, title, sc] of designs) {
  fs.writeFileSync(path.join(OUT_MODELS, `${id}.obj`), obj(sc, id));
  fs.writeFileSync(path.join(OUT_IMAGES, `${id}.svg`), svg(sc, title));
}

console.log("generated OBJ and SVG:", designs.map(([id]) => id).join(", "));
