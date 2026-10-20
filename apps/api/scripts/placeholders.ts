/**
 * Placeholder media for the seed script until the game team sends sample packages:
 * a 1200×1600 card drawn as SVG (no text, so it renders the same without fonts)
 * and a tiny valid glTF 2.0 binary roughly the size of a real miniature (~3 cm).
 */
import sharp from "sharp";

export type Palette = { hue: number; accent: string };

function hsl(h: number, s: number, l: number) {
  return `hsl(${h.toFixed(0)} ${s}% ${l}%)`;
}

/** Card: dark studio backdrop, a stylised figure on a round base, a faction stripe. */
export async function placeholderCard(seed: number, faction: "painted" | "gilded" | null): Promise<Buffer> {
  const hue = (seed * 47) % 360;
  const stripe = faction === "gilded" ? "#c9a227" : faction === "painted" ? "#3b6fd4" : "#777";
  const body = hsl(hue, 45, 42);
  const bodyLight = hsl(hue, 55, 58);
  const trim = hsl((hue + 160) % 360, 50, 55);
  const lean = ((seed % 7) - 3) * 3;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="70%">
      <stop offset="0" stop-color="${hsl(hue, 12, 24)}"/>
      <stop offset="1" stop-color="${hsl(hue, 10, 7)}"/>
    </radialGradient>
    <linearGradient id="body" x1="0" x2="1">
      <stop offset="0" stop-color="${bodyLight}"/>
      <stop offset="1" stop-color="${body}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="1600" fill="url(#bg)"/>
  <rect x="40" y="40" width="1120" height="1520" rx="24" fill="none" stroke="${stripe}" stroke-opacity="0.6" stroke-width="6"/>
  <ellipse cx="600" cy="1110" rx="250" ry="62" fill="#1d1d1d"/>
  <rect x="350" y="1048" width="500" height="62" fill="#2a2a2a"/>
  <ellipse cx="600" cy="1048" rx="250" ry="62" fill="#3a3a3a"/>
  <g transform="rotate(${lean} 600 1040)">
    <rect x="520" y="820" width="60" height="230" rx="20" fill="${body}"/>
    <rect x="620" y="820" width="60" height="230" rx="20" fill="${body}"/>
    <rect x="470" y="560" width="260" height="300" rx="60" fill="url(#body)"/>
    <rect x="470" y="760" width="260" height="34" fill="${trim}"/>
    <rect x="400" y="580" width="70" height="230" rx="30" fill="${body}"/>
    <rect x="730" y="580" width="70" height="230" rx="30" fill="${body}"/>
    <circle cx="600" cy="480" r="95" fill="${hsl(28, 35, 62)}"/>
    <path d="M505 470 Q600 340 695 470 Z" fill="${trim}"/>
  </g>
  <rect x="40" y="1380" width="1120" height="16" fill="${stripe}"/>
  <rect x="120" y="1440" width="${300 + (seed % 5) * 90}" height="36" rx="18" fill="#ffffff" fill-opacity="0.18"/>
  <rect x="120" y="1500" width="${200 + (seed % 3) * 120}" height="24" rx="12" fill="#ffffff" fill-opacity="0.1"/>
</svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

type Box = { min: [number, number, number]; max: [number, number, number] };

/**
 * Valid glTF 2.0 binary: one node, one mesh, one primitive, one material
 * (same shape constraints as the game's export, spec section 13). Metres, +Y up.
 */
export function placeholderGlb(rgb: [number, number, number]): Buffer {
  const boxes: Box[] = [
    { min: [-0.0125, 0, -0.0125], max: [0.0125, 0.004, 0.0125] }, // base
    { min: [-0.005, 0.004, -0.003], max: [0.005, 0.02, 0.003] }, // body
    { min: [-0.0035, 0.02, -0.0035], max: [0.0035, 0.027, 0.0035] }, // head
  ];

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (const { min, max } of boxes) {
    const [x0, y0, z0] = min;
    const [x1, y1, z1] = max;
    // Each face: normal + 4 corners counter-clockwise seen from outside.
    const faces: [number[], number[][]][] = [
      [[1, 0, 0], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]],
      [[-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]],
      [[0, 1, 0], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]],
      [[0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]],
      [[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
      [[0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]],
    ];
    for (const [n, corners] of faces) {
      const base = positions.length / 3;
      for (const c of corners) {
        positions.push(...c);
        normals.push(...n);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  const posBuf = Buffer.from(new Float32Array(positions).buffer);
  const nrmBuf = Buffer.from(new Float32Array(normals).buffer);
  const idxBuf = Buffer.from(new Uint32Array(indices).buffer);
  const bin = Buffer.concat([posBuf, nrmBuf, idxBuf]); // all lengths are multiples of 4

  const vertexCount = positions.length / 3;
  const xs = positions.filter((_, i) => i % 3 === 0);
  const ys = positions.filter((_, i) => i % 3 === 1);
  const zs = positions.filter((_, i) => i % 3 === 2);

  const gltf = {
    asset: { version: "2.0", generator: "miniature-workshop-web seed" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [...rgb, 1],
          metallicFactor: 0,
          roughnessFactor: 0.7,
        },
        doubleSided: false,
      },
    ],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBuf.length, target: 34962 },
      { buffer: 0, byteOffset: posBuf.length, byteLength: nrmBuf.length, target: 34962 },
      { buffer: 0, byteOffset: posBuf.length + nrmBuf.length, byteLength: idxBuf.length, target: 34963 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: vertexCount,
        type: "VEC3",
        min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)],
        max: [Math.max(...xs), Math.max(...ys), Math.max(...zs)],
      },
      { bufferView: 1, componentType: 5126, count: vertexCount, type: "VEC3" },
      { bufferView: 2, componentType: 5125, count: indices.length, type: "SCALAR" },
    ],
  };

  let json = Buffer.from(JSON.stringify(gltf), "utf8");
  const jsonPad = (4 - (json.length % 4)) % 4;
  json = Buffer.concat([json, Buffer.alloc(jsonPad, 0x20)]);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);

  const chunk = (type: number, data: Buffer) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(data.length, 0);
    h.writeUInt32LE(type, 4);
    return Buffer.concat([h, data]);
  };

  return Buffer.concat([header, chunk(0x4e4f534a, json), chunk(0x004e4942, bin)]);
}
