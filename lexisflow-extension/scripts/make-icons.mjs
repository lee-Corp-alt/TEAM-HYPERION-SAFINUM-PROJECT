// Draws the LexisFlow icon as PNG files (16, 48, 128 px) with no image tools. It is the brand mark from
// src/components/icons.tsx (BrandMark): two nested L-shaped brackets, in teal and light teal, on the
// slate tile, with the amber dot that stands for the speech highlight. Edges are anti-aliased by
// sampling each pixel several times.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
mkdirSync(out, { recursive: true });

const SLATE = [15, 23, 42];
const TEAL = [20, 184, 166];
const TEAL_LIGHT = [94, 234, 212];
const AMBER = [245, 158, 11];

// The two brackets, in the 32 x 32 box of BrandMark. Curves are sampled into short segments, so the
// distance to the line gives round corners and round ends like the original strokes (width 4).
function bezier([x0, y0], [x1, y1], [x2, y2], [x3, y3], n = 14) {
  const points = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    points.push([
      u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
      u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
    ]);
  }
  return points;
}
// M7 7.5 v12.8 c0 2.3 1.9 4.2 4.2 4.2 H25
const OUTER = [[7, 7.5], [7, 20.3], ...bezier([7, 20.3], [7, 22.6], [8.9, 24.5], [11.2, 24.5]), [25, 24.5]];
// M13 8 v8.2 c0 1 .8 1.8 1.8 1.8 H25
const INNER = [[13, 8], [13, 16.2], ...bezier([13, 16.2], [13, 17.2], [13.8, 18], [14.8, 18]), [25, 18]];
const HALF_STROKE = 2;

function distanceToLine(px, py, points) {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
  }
  return best;
}

function render(size) {
  const px = new Uint8Array(size * size * 4);
  const radius = 28 / 128; // tile corner, as a share of the tile
  // Small icons get a larger mark, so its strokes stay a readable width.
  const markScale = size <= 24 ? 3.1 : 2.7;
  const grid = size <= 48 ? 8 : 4; // samples per pixel side
  const insideTile = (u, v) => {
    const cx = Math.min(Math.max(u, radius), 1 - radius);
    const cy = Math.min(Math.max(v, radius), 1 - radius);
    return (u - cx) ** 2 + (v - cy) ** 2 <= radius * radius;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let covered = 0;
      for (let sy = 0; sy < grid; sy++) {
        for (let sx = 0; sx < grid; sx++) {
          const u = (x + (sx + 0.5) / grid) / size;
          const v = (y + (sy + 0.5) / grid) / size;
          if (!insideTile(u, v)) continue; // transparent outside the rounded tile
          // the point in BrandMark's 32-unit box
          const mx = 16 + ((u - 0.5) * 128) / markScale;
          const my = 16 + ((v - 0.5) * 128) / markScale;
          let c = SLATE;
          if (distanceToLine(mx, my, OUTER) <= HALF_STROKE) c = TEAL;
          if (distanceToLine(mx, my, INNER) <= HALF_STROKE) c = TEAL_LIGHT;
          if ((u - 97 / 128) ** 2 + (v - 36 / 128) ** 2 <= (11 / 128) ** 2) c = AMBER;
          r += c[0];
          g += c[1];
          b += c[2];
          covered++;
        }
      }
      if (!covered) continue;
      const i = (y * size + x) * 4;
      px[i] = Math.round(r / covered);
      px[i + 1] = Math.round(g / covered);
      px[i + 2] = Math.round(b / covered);
      px[i + 3] = Math.round((255 * covered) / (grid * grid));
    }
  }
  return px;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  const px = render(size);
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [16, 48, 128]) {
  writeFileSync(join(out, `icon${size}.png`), png(size));
  console.log(`wrote public/icons/icon${size}.png`);
}
