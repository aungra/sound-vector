import fs from "node:fs";
import path from "node:path";

const outDir = "models";
const imageDir = "images";
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(imageDir, { recursive: true });

const vertices = [];
const faces = [];
const materials = [];
let currentMaterial = "mat_black";

function v(x, y, z) {
  vertices.push([x, y, z]);
  return vertices.length;
}

function use(name) {
  currentMaterial = name;
}

function f(indices) {
  faces.push({ material: currentMaterial, indices });
}

function box(cx, cy, cz, sx, sy, sz, name) {
  use(name);
  const x = sx / 2, y = sy / 2, z = sz / 2;
  const pts = [
    v(cx - x, cy - y, cz - z), v(cx + x, cy - y, cz - z), v(cx + x, cy + y, cz - z), v(cx - x, cy + y, cz - z),
    v(cx - x, cy - y, cz + z), v(cx + x, cy - y, cz + z), v(cx + x, cy + y, cz + z), v(cx - x, cy + y, cz + z)
  ];
  f([pts[0], pts[1], pts[2], pts[3]]);
  f([pts[4], pts[7], pts[6], pts[5]]);
  f([pts[0], pts[4], pts[5], pts[1]]);
  f([pts[1], pts[5], pts[6], pts[2]]);
  f([pts[2], pts[6], pts[7], pts[3]]);
  f([pts[3], pts[7], pts[4], pts[0]]);
}

function cylinder(cx, cy, cz, radius, height, name, segments = 16, axis = "z") {
  use(name);
  const bottom = [];
  const top = [];
  for (let i = 0; i < segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    const ca = Math.cos(a) * radius;
    const sa = Math.sin(a) * radius;
    if (axis === "z") {
      bottom.push(v(cx + ca, cy + sa, cz - height / 2));
      top.push(v(cx + ca, cy + sa, cz + height / 2));
    } else if (axis === "y") {
      bottom.push(v(cx + ca, cy - height / 2, cz + sa));
      top.push(v(cx + ca, cy + height / 2, cz + sa));
    } else {
      bottom.push(v(cx - height / 2, cy + ca, cz + sa));
      top.push(v(cx + height / 2, cy + ca, cz + sa));
    }
  }
  for (let i = 0; i < segments; i += 1) {
    const n = (i + 1) % segments;
    f([bottom[i], bottom[n], top[n], top[i]]);
  }
  f([...bottom].reverse());
  f([...top]);
}

function sphere(cx, cy, cz, radius, name, lat = 8, lon = 16) {
  use(name);
  const grid = [];
  for (let i = 0; i <= lat; i += 1) {
    const theta = (i / lat) * Math.PI;
    const row = [];
    for (let j = 0; j < lon; j += 1) {
      const phi = (j / lon) * Math.PI * 2;
      row.push(v(
        cx + radius * Math.sin(theta) * Math.cos(phi),
        cy + radius * Math.sin(theta) * Math.sin(phi),
        cz + radius * Math.cos(theta)
      ));
    }
    grid.push(row);
  }
  for (let i = 0; i < lat; i += 1) {
    for (let j = 0; j < lon; j += 1) {
      const n = (j + 1) % lon;
      f([grid[i][j], grid[i][n], grid[i + 1][n], grid[i + 1][j]]);
    }
  }
}

function ellipsoid(cx, cy, cz, sx, sy, sz, name, lat = 10, lon = 18) {
  use(name);
  const grid = [];
  for (let i = 0; i <= lat; i += 1) {
    const theta = (i / lat) * Math.PI;
    const row = [];
    for (let j = 0; j < lon; j += 1) {
      const phi = (j / lon) * Math.PI * 2;
      row.push(v(
        cx + sx * Math.sin(theta) * Math.cos(phi),
        cy + sy * Math.sin(theta) * Math.sin(phi),
        cz + sz * Math.cos(theta)
      ));
    }
    grid.push(row);
  }
  for (let i = 0; i < lat; i += 1) {
    for (let j = 0; j < lon; j += 1) {
      const n = (j + 1) % lon;
      f([grid[i][j], grid[i][n], grid[i + 1][n], grid[i + 1][j]]);
    }
  }
}

function normalize(p) {
  const len = Math.hypot(p[0], p[1], p[2]) || 1;
  return [p[0] / len, p[1] / len, p[2] / len];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function mul(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function taperedLimb(a, b, r0, r1, name, segments = 14) {
  use(name);
  const axis = normalize([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  const guide = Math.abs(axis[2]) > 0.82 ? [1, 0, 0] : [0, 0, 1];
  const right = normalize(cross(axis, guide));
  const up = normalize(cross(right, axis));
  const start = [];
  const end = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const radial = add(mul(right, Math.cos(angle)), mul(up, Math.sin(angle)));
    start.push(v(...add(a, mul(radial, r0))));
    end.push(v(...add(b, mul(radial, r1))));
  }
  for (let i = 0; i < segments; i += 1) {
    const n = (i + 1) % segments;
    f([start[i], start[n], end[n], end[i]]);
  }
  f([...start].reverse());
  f([...end]);
}

function taperedTorso(cx, cy, cz, shoulderW, hipW, depth, height, name, segments = 8) {
  use(name);
  const topZ = cz + height / 2;
  const bottomZ = cz - height / 2;
  const top = [];
  const bottom = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    top.push(v(cx + c * shoulderW / 2, cy + s * depth / 2, topZ));
    bottom.push(v(cx + c * hipW / 2, cy + s * depth * 0.42, bottomZ));
  }
  for (let i = 0; i < segments; i += 1) {
    const n = (i + 1) % segments;
    f([top[i], top[n], bottom[n], bottom[i]]);
  }
  f([...top]);
  f([...bottom].reverse());
}

function person(x, y, scale, shirt, pose = 0) {
  const z0 = 0;
  const headZ = z0 + 3.05 * scale;
  const neckZ = z0 + 2.62 * scale;
  const shoulderZ = z0 + 2.45 * scale;
  const torsoZ = z0 + 1.9 * scale;
  const hipZ = z0 + 1.25 * scale;
  const kneeZ = z0 + 0.62 * scale;
  const ankleZ = z0 + 0.15 * scale;
  const shoulderW = 0.72 * scale;
  const hipW = 0.48 * scale;
  const stance = pose ? 0.12 * scale : 0.05 * scale;

  ellipsoid(x, y, headZ, 0.24 * scale, 0.2 * scale, 0.32 * scale, "mat_skin", 12, 18);
  ellipsoid(x, y - 0.01 * scale, headZ + 0.12 * scale, 0.255 * scale, 0.21 * scale, 0.18 * scale, "mat_hair", 7, 18);
  taperedLimb([x, y, neckZ - 0.08 * scale], [x, y, neckZ + 0.12 * scale], 0.08 * scale, 0.09 * scale, "mat_skin", 12);
  taperedTorso(x, y, torsoZ, shoulderW, hipW, 0.3 * scale, 1.0 * scale, shirt, 10);
  taperedTorso(x, y, hipZ, hipW, 0.5 * scale, 0.26 * scale, 0.32 * scale, "mat_dark_cloth", 8);

  const lHip = [x - 0.18 * scale, y, hipZ - 0.1 * scale];
  const rHip = [x + 0.18 * scale, y, hipZ - 0.1 * scale];
  const lKnee = [x - 0.24 * scale - stance, y + 0.02 * scale, kneeZ];
  const rKnee = [x + 0.26 * scale + stance, y + 0.02 * scale, kneeZ + (pose ? 0.08 * scale : 0)];
  const lAnkle = [x - 0.3 * scale - stance, y + 0.04 * scale, ankleZ];
  const rAnkle = [x + 0.31 * scale + stance, y + 0.04 * scale, ankleZ];
  taperedLimb(lHip, lKnee, 0.105 * scale, 0.095 * scale, "mat_skin");
  taperedLimb(lKnee, lAnkle, 0.092 * scale, 0.072 * scale, "mat_skin");
  taperedLimb(rHip, rKnee, 0.105 * scale, 0.095 * scale, "mat_skin");
  taperedLimb(rKnee, rAnkle, 0.092 * scale, 0.072 * scale, "mat_skin");
  box(x - 0.36 * scale - stance, y + 0.03 * scale, 0.04 * scale, 0.42 * scale, 0.18 * scale, 0.12 * scale, "mat_black");
  box(x + 0.39 * scale + stance, y + 0.03 * scale, 0.04 * scale, 0.42 * scale, 0.18 * scale, 0.12 * scale, "mat_black");

  const leftShoulder = [x - shoulderW * 0.48, y, shoulderZ];
  const rightShoulder = [x + shoulderW * 0.48, y, shoulderZ];
  if (pose === 0) {
    taperedLimb(leftShoulder, [x - 0.62 * scale, y - 0.03 * scale, torsoZ + 0.2 * scale], 0.08 * scale, 0.065 * scale, "mat_skin");
    taperedLimb([x - 0.62 * scale, y - 0.03 * scale, torsoZ + 0.2 * scale], [x - 0.86 * scale, y - 0.08 * scale, torsoZ - 0.18 * scale], 0.065 * scale, 0.052 * scale, "mat_skin");
    taperedLimb(rightShoulder, [x + 0.62 * scale, y - 0.03 * scale, torsoZ + 0.2 * scale], 0.08 * scale, 0.065 * scale, "mat_skin");
    taperedLimb([x + 0.62 * scale, y - 0.03 * scale, torsoZ + 0.2 * scale], [x + 0.84 * scale, y - 0.08 * scale, torsoZ - 0.12 * scale], 0.065 * scale, 0.052 * scale, "mat_skin");
  } else {
    taperedLimb(leftShoulder, [x - 0.62 * scale, y - 0.04 * scale, torsoZ + 0.45 * scale], 0.08 * scale, 0.065 * scale, "mat_skin");
    taperedLimb([x - 0.62 * scale, y - 0.04 * scale, torsoZ + 0.45 * scale], [x - 0.86 * scale, y - 0.05 * scale, torsoZ + 0.22 * scale], 0.065 * scale, 0.052 * scale, "mat_skin");
    taperedLimb(rightShoulder, [x + 0.62 * scale, y - 0.04 * scale, torsoZ + 0.3 * scale], 0.08 * scale, 0.065 * scale, "mat_skin");
    taperedLimb([x + 0.62 * scale, y - 0.04 * scale, torsoZ + 0.3 * scale], [x + 0.8 * scale, y - 0.05 * scale, torsoZ + 0.05 * scale], 0.065 * scale, 0.052 * scale, "mat_skin");
  }
}

function loadReferenceBody() {
  const source = "/Users/kahanishimoto/Documents/New project/models/FinalBaseMesh.obj";
  const raw = fs.readFileSync(source, "utf8").split(/\r?\n/);
  const sourceVertices = [];
  const sourceFaces = [];
  for (const line of raw) {
    if (line.startsWith("v ")) {
      const coords = line.trim().split(/\s+/).slice(1, 4).map(Number);
      if (coords.length === 3 && coords.every(Number.isFinite)) sourceVertices.push(coords);
    } else if (line.startsWith("f ")) {
      const indices = line.trim().split(/\s+/).slice(1).map((token) => Number(token.split("/")[0]) - 1);
      if (indices.length >= 3 && indices.every(Number.isFinite)) sourceFaces.push(indices);
    }
  }

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  sourceVertices.forEach((point) => {
    for (let i = 0; i < 3; i += 1) {
      min[i] = Math.min(min[i], point[i]);
      max[i] = Math.max(max[i], point[i]);
    }
  });

  return {
    vertices: sourceVertices,
    faces: sourceFaces,
    min,
    max,
    height: max[1] - min[1]
  };
}

const referenceBody = loadReferenceBody();

function referenceMaterial(local, shirt) {
  const heightRatio = local[1];
  const shoulderDistance = Math.abs(local[0]);
  const depthDistance = Math.abs(local[2]);
  if (heightRatio > 0.9) return "mat_hair";
  if (heightRatio > 0.78) return "mat_skin";
  if (heightRatio > 0.43 && shoulderDistance < 0.23 && depthDistance < 0.09) return shirt;
  if (heightRatio > 0.32 && shoulderDistance < 0.19) return "mat_dark_cloth";
  return "mat_skin";
}

function referencePerson(cx, cy, scale, shirt, rotate = 0, faceStep = 1) {
  const map = new Map();
  const cos = Math.cos(rotate);
  const sin = Math.sin(rotate);
  const height = 3.25 * scale;
  const widthScale = 0.72;
  const depthScale = 0.56;

  function addVertex(sourceIndex) {
    if (map.has(sourceIndex)) return map.get(sourceIndex);
    const point = referenceBody.vertices[sourceIndex];
    const nx = (point[0] - (referenceBody.min[0] + referenceBody.max[0]) / 2) / referenceBody.height;
    const ny = (point[1] - referenceBody.min[1]) / referenceBody.height;
    const nz = (point[2] - (referenceBody.min[2] + referenceBody.max[2]) / 2) / referenceBody.height;
    const localX = nx * height * widthScale;
    const localY = nz * height * depthScale;
    const worldX = cx + localX * cos - localY * sin;
    const worldY = cy + localX * sin + localY * cos;
    const worldZ = ny * height;
    const index = v(worldX, worldY, worldZ);
    map.set(sourceIndex, index);
    return index;
  }

  referenceBody.faces.forEach((sourceFace, faceIndex) => {
    if (faceIndex % faceStep !== 0) return;
    const center = sourceFace.reduce((acc, sourceIndex) => {
      const point = referenceBody.vertices[sourceIndex];
      acc[0] += (point[0] - (referenceBody.min[0] + referenceBody.max[0]) / 2) / referenceBody.height;
      acc[1] += (point[1] - referenceBody.min[1]) / referenceBody.height;
      acc[2] += (point[2] - (referenceBody.min[2] + referenceBody.max[2]) / 2) / referenceBody.height;
      return acc;
    }, [0, 0, 0]).map((value) => value / sourceFace.length);
    use(referenceMaterial(center, shirt));
    f(sourceFace.map(addVertex));
  });
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function pointOnBentSegment(a, b, c, t) {
  if (t < 0.5) {
    const p = t / 0.5;
    return [mix(a[0], b[0], p), mix(a[1], b[1], p), mix(a[2], b[2], p)];
  }
  const p = (t - 0.5) / 0.5;
  return [mix(b[0], c[0], p), mix(b[1], c[1], p), mix(b[2], c[2], p)];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function rotateY(point, pivot, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const x = point[0] - pivot[0];
  const z = point[2] - pivot[2];
  return [
    pivot[0] + x * c + z * s,
    point[1],
    pivot[2] - x * s + z * c
  ];
}

function rotateZ(point, pivot, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const x = point[0] - pivot[0];
  const y = point[1] - pivot[1];
  return [
    pivot[0] + x * c - y * s,
    pivot[1] + x * s + y * c,
    point[2]
  ];
}

function rotateX(point, pivot, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const y = point[1] - pivot[1];
  const z = point[2] - pivot[2];
  return [
    point[0],
    pivot[1] + y * c - z * s,
    pivot[2] + y * s + z * c
  ];
}

function blendPoint(a, b, weight) {
  return [
    mix(a[0], b[0], weight),
    mix(a[1], b[1], weight),
    mix(a[2], b[2], weight)
  ];
}

function posedReferencePerson({
  x,
  y,
  scale,
  rotate = 0,
  lean = 0,
  headTurn = 0,
  leftArm = {},
  rightArm = {},
  leftLeg = {},
  rightLeg = {},
  faceStep = 1
}) {
  const map = new Map();
  const cos = Math.cos(rotate);
  const sin = Math.sin(rotate);
  const height = 3.22 * scale;
  const widthScale = 0.72;
  const depthScale = 0.52;

  function world(local) {
    const lx = local[0] * scale;
    const ly = local[1] * scale;
    const lz = local[2] * scale;
    return [
      x + lx * cos - ly * sin,
      y + lx * sin + ly * cos,
      lz
    ];
  }

  function deform(localX, localY, localZ, nx, ny, nz) {
    const side = Math.sign(nx) || 1;
    const absX = Math.abs(nx);
    const point = [localX, localY, localZ];
    const heightRatio = localZ / height;
    point[0] += lean * heightRatio * 0.18 * scale;

    const isArm = absX > 0.095 && heightRatio > 0.42 && heightRatio < 0.78;
    if (isArm) {
      const pose = side < 0 ? leftArm : rightArm;
      const shoulder = [side * 0.3 * height * widthScale, 0, 0.72 * height];
      const elbowInfluence = smoothstep(0.54, 0.72, heightRatio);
      const handInfluence = 1 - smoothstep(0.55, 0.76, heightRatio);
      let rotated = rotateY(point, shoulder, (pose.raise ?? 0) * side);
      rotated = rotateZ(rotated, shoulder, pose.forward ?? 0);
      rotated = rotateX(rotated, shoulder, pose.depth ?? 0);
      point[0] = mix(point[0], rotated[0], clamp(elbowInfluence + handInfluence * 0.35, 0, 1));
      point[1] = mix(point[1], rotated[1] + (pose.pullY ?? 0) * scale * handInfluence, clamp(handInfluence, 0, 0.8));
      point[2] = mix(point[2], rotated[2] + (pose.drop ?? 0) * scale * handInfluence, clamp(elbowInfluence + handInfluence * 0.3, 0, 1));
    }

    const isLeg = heightRatio < 0.42 && absX > 0.025;
    if (isLeg) {
      const pose = side < 0 ? leftLeg : rightLeg;
      const hip = [side * 0.12 * height * widthScale, 0, 0.37 * height];
      const footInfluence = 1 - smoothstep(0.2, 0.42, heightRatio);
      let rotated = rotateY(point, hip, (pose.splay ?? 0) * side);
      rotated = rotateX(rotated, hip, pose.step ?? 0);
      point[0] = mix(point[0], rotated[0], clamp(footInfluence, 0, 0.85));
      point[1] = mix(point[1], rotated[1] + (pose.pullY ?? 0) * scale * footInfluence, clamp(footInfluence, 0, 0.75));
      point[2] = mix(point[2], rotated[2], clamp(footInfluence, 0, 0.65));
    }

    if (heightRatio > 0.78) {
      const neck = [0, 0, 0.8 * height];
      const turned = rotateZ(point, neck, headTurn * 0.18);
      const tilted = rotateY(turned, neck, lean * 0.08);
      return world(blendPoint(point, tilted, smoothstep(0.78, 0.94, heightRatio)));
    }

    return world(point);
  }

  function addVertex(sourceIndex) {
    if (map.has(sourceIndex)) return map.get(sourceIndex);
    const source = referenceBody.vertices[sourceIndex];
    const nx = (source[0] - (referenceBody.min[0] + referenceBody.max[0]) / 2) / referenceBody.height;
    const ny = (source[1] - referenceBody.min[1]) / referenceBody.height;
    const nz = (source[2] - (referenceBody.min[2] + referenceBody.max[2]) / 2) / referenceBody.height;
    const localX = nx * height * widthScale;
    const localY = nz * height * depthScale;
    const localZ = ny * height;
    const index = v(...deform(localX, localY, localZ, nx, ny, nz));
    map.set(sourceIndex, index);
    return index;
  }

  referenceBody.faces.forEach((sourceFace, faceIndex) => {
    if (faceIndex % faceStep !== 0) return;
    use("mat_ink");
    f(sourceFace.map(addVertex));
  });
}

function joint(base, scale, point) {
  return [
    base[0] + point[0] * scale,
    base[1] + point[1] * scale,
    point[2] * scale
  ];
}

function bendLimb(base, scale, points, radii, name = "mat_ink") {
  for (let i = 0; i < points.length - 1; i += 1) {
    taperedLimb(
      joint(base, scale, points[i]),
      joint(base, scale, points[i + 1]),
      radii[i] * scale,
      radii[i + 1] * scale,
      name,
      8
    );
  }
}

function photoPosePerson({ x, y, scale, lean = 0, headTurn = 0, shirtHeight = 0.86, leftArm, rightArm, leftLeg, rightLeg }) {
  const base = [x, y, 0];
  const shoulderZ = 2.34;
  const torsoZ = 1.85;
  const hipZ = 1.18;

  ellipsoid(x + lean * 0.18 * scale, y, 2.93 * scale, 0.22 * scale, 0.18 * scale, 0.3 * scale, "mat_ink", 7, 10);
  ellipsoid(x + lean * 0.2 * scale + headTurn * 0.04 * scale, y - 0.02 * scale, 3.05 * scale, 0.24 * scale, 0.19 * scale, 0.12 * scale, "mat_ink", 5, 10);
  taperedLimb(joint(base, scale, [lean * 0.05, 0, 2.52]), joint(base, scale, [lean * 0.1, 0, 2.68]), 0.065 * scale, 0.075 * scale, "mat_ink", 8);
  taperedTorso(x + lean * 0.1 * scale, y, torsoZ * scale, 0.68 * scale, 0.48 * scale, 0.24 * scale, shirtHeight * scale, "mat_ink", 8);
  taperedTorso(x + lean * 0.08 * scale, y, hipZ * scale, 0.48 * scale, 0.42 * scale, 0.22 * scale, 0.24 * scale, "mat_ink", 8);

  const defaultLeftLeg = [[-0.18, 0, hipZ], [-0.28, 0.02, 0.62], [-0.33, 0.04, 0.12]];
  const defaultRightLeg = [[0.18, 0, hipZ], [0.3, 0.02, 0.62], [0.36, 0.04, 0.12]];
  bendLimb(base, scale, leftLeg ?? defaultLeftLeg, [0.095, 0.082, 0.06]);
  bendLimb(base, scale, rightLeg ?? defaultRightLeg, [0.095, 0.082, 0.06]);
  box(x - 0.36 * scale, y + 0.05 * scale, 0.02 * scale, 0.34 * scale, 0.14 * scale, 0.08 * scale, "mat_ink");
  box(x + 0.4 * scale, y + 0.05 * scale, 0.02 * scale, 0.34 * scale, 0.14 * scale, 0.08 * scale, "mat_ink");

  const shoulderLeft = [-0.36, 0, shoulderZ];
  const shoulderRight = [0.36, 0, shoulderZ];
  bendLimb(base, scale, [shoulderLeft, ...(leftArm ?? [[-0.58, -0.03, 1.82], [-0.72, -0.05, 1.35]])], [0.072, 0.058, 0.046]);
  bendLimb(base, scale, [shoulderRight, ...(rightArm ?? [[0.58, -0.03, 1.82], [0.72, -0.05, 1.35]])], [0.072, 0.058, 0.046]);
}

function flagCloth() {
  const cols = 7;
  const rows = 4;
  const width = 4.75;
  const height = 1.55;
  const originX = -1.85;
  const originZ = 1.0;
  const y = -0.6;
  const grid = [];
  for (let r = 0; r <= rows; r += 1) {
    const row = [];
    for (let c = 0; c <= cols; c += 1) {
      const px = originX + (c / cols) * width;
      const pz = originZ + (1 - r / rows) * height + Math.sin(c * 0.8) * 0.1;
      const py = y + Math.sin(c * 0.9 + r * 0.35) * 0.16;
      row.push(v(px, py, pz));
    }
    grid.push(row);
  }
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      use("mat_ink");
      f([grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]]);
    }
  }
  const left = originX;
  const right = originX + width;
  const top = originZ + height;
  const bottom = originZ;
  const mid = originZ + height * 0.5;
  use("mat_ink");
  f([v(left, y - 0.015, top), v(right, y - 0.015, top - 0.08), v(right, y - 0.015, top - height * 0.33), v(left, y - 0.015, top - height * 0.34)]);
  f([v(left, y - 0.018, bottom + height * 0.33), v(right, y - 0.018, bottom + height * 0.34), v(right, y - 0.018, bottom), v(left, y - 0.018, bottom)]);
  f([v(left, y - 0.021, top), v(left + width * 0.34, y - 0.021, mid), v(left, y - 0.021, bottom)]);
  cylinder(originX - 0.12, y - 0.02, originZ + height * 0.45, 0.03, height * 1.3, "mat_ink", 8, "z");
}

function writeObj() {
  const obj = ["mtllib people_flag_from_photo.mtl", "o people_and_flag_from_photo"];
  vertices.forEach(([x, y, z]) => obj.push(`v ${x.toFixed(4)} ${y.toFixed(4)} ${z.toFixed(4)}`));
  let active = "";
  faces.forEach((face) => {
    if (face.material !== active) {
      active = face.material;
      obj.push(`usemtl ${active}`);
    }
    obj.push(`f ${face.indices.join(" ")}`);
  });
  fs.writeFileSync(path.join(outDir, "people_flag_from_photo.obj"), obj.join("\n") + "\n");
}

function writeMtl() {
  const colors = {
    mat_ink: [0.02, 0.02, 0.02],
    mat_skin: [0.02, 0.02, 0.02],
    mat_hair: [0.02, 0.02, 0.02],
    mat_black: [0.02, 0.02, 0.02],
    mat_dark_cloth: [0.02, 0.02, 0.02],
    mat_navy_shirt: [0.02, 0.02, 0.02],
    mat_white_shirt: [0.02, 0.02, 0.02],
    mat_gray_shirt: [0.02, 0.02, 0.02],
    mat_flag_black: [0.02, 0.02, 0.02],
    mat_flag_white: [0.02, 0.02, 0.02],
    mat_flag_green: [0.02, 0.02, 0.02],
    mat_flag_red: [0.02, 0.02, 0.02],
    mat_flag_pole: [0.02, 0.02, 0.02]
  };
  const mtl = [];
  for (const [name, color] of Object.entries(colors)) {
    materials.push(name);
    mtl.push(`newmtl ${name}`);
    mtl.push(`Kd ${color.join(" ")}`);
    mtl.push("Ka 0 0 0");
    mtl.push("Ks 0.02 0.02 0.02");
    mtl.push("Ns 12");
    mtl.push("");
  }
  fs.writeFileSync(path.join(outDir, "people_flag_from_photo.mtl"), mtl.join("\n"));
}

const materialColors = {
  mat_ink: "#111111",
  mat_skin: "#111111",
  mat_hair: "#111111",
  mat_black: "#111111",
  mat_dark_cloth: "#111111",
  mat_navy_shirt: "#111111",
  mat_white_shirt: "#111111",
  mat_gray_shirt: "#111111",
  mat_flag_black: "#111111",
  mat_flag_white: "#111111",
  mat_flag_green: "#111111",
  mat_flag_red: "#111111",
  mat_flag_pole: "#111111"
};

function project(point) {
  const x = (point[0] - point[1]) * 96;
  const y = (point[0] + point[1]) * 48 - point[2] * 102;
  return [x, y];
}

function writeSvg(filename) {
  const projected = vertices.map(project);
  const xs = projected.map((p) => p[0]);
  const ys = projected.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.min(940 / (maxX - minX), 940 / (maxY - minY));
  const tx = 600 - ((minX + maxX) / 2) * scale;
  const ty = 600 - ((minY + maxY) / 2) * scale;

  function signedArea(points) {
    let area = 0;
    for (let i = 0; i < points.length; i += 1) {
      const next = (i + 1) % points.length;
      area += points[i][0] * points[next][1] - points[next][0] * points[i][1];
    }
    return area / 2;
  }

  function drawPoint(index) {
    const [x, y] = projected[index - 1];
    return [(x * scale + tx).toFixed(1), (y * scale + ty).toFixed(1)];
  }

  const faceSigns = faces.map((face) => {
    const area = signedArea(face.indices.map((idx) => projected[idx - 1]));
    if (Math.abs(area) < 0.0001) return 0;
    return area > 0 ? 1 : -1;
  });
  const edgeMap = new Map();
  faces.forEach((face, faceIndex) => {
    face.indices.forEach((start, i) => {
      const end = face.indices[(i + 1) % face.indices.length];
      const key = start < end ? `${start}:${end}` : `${end}:${start}`;
      const list = edgeMap.get(key) ?? [];
      list.push({ start, end, sign: faceSigns[faceIndex] });
      edgeMap.set(key, list);
    });
  });

  const contourLines = [];
  edgeMap.forEach((entries) => {
    const signs = entries.map((entry) => entry.sign).filter(Boolean);
    const isBoundary = entries.length === 1;
    const isSilhouette = signs.length > 1 && new Set(signs).size > 1;
    if (!isBoundary && !isSilhouette) return;
    const edge = entries[0];
    const [x1, y1] = drawPoint(edge.start);
    const [x2, y2] = drawPoint(edge.end);
    contourLines.push(`<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="#111111" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`);
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" role="img" aria-labelledby="title desc">
  <title id="title">People and flag contour trace</title>
  <desc id="desc">Contour-only SVG trace generated from people and flag geometry.</desc>
  ${contourLines.join("\n  ")}
</svg>
`;
  fs.writeFileSync(path.join(imageDir, filename), svg);
}

posedReferencePerson({
  x: -2.45,
  y: 0.02,
  scale: 1.0,
  lean: -0.08,
  headTurn: 0.2,
  rotate: -0.08,
  leftArm: { raise: -0.18, forward: 0.18, depth: -0.08, pullY: -0.12, drop: 0.08 },
  rightArm: { raise: 0.22, forward: -0.2, depth: -0.1, pullY: -0.15, drop: -0.05 },
  leftLeg: { splay: 0.08, step: -0.08, pullY: 0.04 },
  rightLeg: { splay: 0.03, step: 0.04, pullY: 0.02 }
});
posedReferencePerson({
  x: -1.22,
  y: -0.02,
  scale: 0.98,
  lean: 0.02,
  headTurn: -0.15,
  rotate: -0.03,
  leftArm: { raise: -0.1, forward: 0.1, depth: -0.04, pullY: -0.06, drop: 0.02 },
  rightArm: { raise: 0.18, forward: -0.16, depth: -0.08, pullY: -0.16, drop: -0.08 },
  leftLeg: { splay: -0.02, step: -0.02, pullY: 0.02 },
  rightLeg: { splay: 0.05, step: 0.03, pullY: 0.04 }
});
posedReferencePerson({
  x: 0.08,
  y: -0.05,
  scale: 1.06,
  lean: 0.04,
  headTurn: 0.05,
  rotate: 0.04,
  leftArm: { raise: -0.22, forward: 0.22, depth: -0.1, pullY: -0.18, drop: -0.06 },
  rightArm: { raise: 0.12, forward: -0.14, depth: -0.06, pullY: -0.12, drop: -0.04 },
  leftLeg: { splay: 0.05, step: -0.04, pullY: 0.03 },
  rightLeg: { splay: 0.08, step: 0.04, pullY: 0.04 }
});
posedReferencePerson({
  x: 1.3,
  y: -0.02,
  scale: 0.94,
  lean: 0.06,
  headTurn: -0.12,
  rotate: 0.08,
  leftArm: { raise: -0.14, forward: 0.16, depth: -0.08, pullY: -0.12, drop: 0 },
  rightArm: { raise: 0.2, forward: -0.2, depth: -0.1, pullY: -0.14, drop: 0.04 },
  leftLeg: { splay: -0.03, step: -0.03, pullY: 0.02 },
  rightLeg: { splay: 0.05, step: 0.04, pullY: 0.03 }
});
posedReferencePerson({
  x: 2.45,
  y: 0.03,
  scale: 0.92,
  lean: 0.04,
  headTurn: -0.18,
  rotate: 0.12,
  leftArm: { raise: -0.08, forward: 0.12, depth: -0.06, pullY: -0.08, drop: 0.04 },
  rightArm: { raise: 0.1, forward: -0.12, depth: -0.04, pullY: -0.08, drop: 0.12 },
  leftLeg: { splay: -0.02, step: -0.03, pullY: 0.03 },
  rightLeg: { splay: 0.05, step: 0.05, pullY: 0.04 }
});
flagCloth();

writeMtl();
writeObj();
writeSvg("people_flag_from_photo.svg");
writeSvg("people_flag_line_art.svg");
writeSvg("t-01.svg");

console.log(path.join(outDir, "people_flag_from_photo.obj"));
