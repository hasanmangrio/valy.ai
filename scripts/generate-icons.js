#!/usr/bin/env node
/**
 * Generates icons/icon{16,48,128}.png — solid purple squares with a white
 * lightning bolt overlay. No external dependencies; uses Node built-ins only.
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const PURPLE = [123, 47, 247]; // #7B2FF7
const WHITE = [255, 255, 255];

// CRC32 table
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const tag = Buffer.from(type);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tag, data])));
  return Buffer.concat([len, tag, data, crc]);
}

function createPNG(size, pixelFn) {
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // RGB color
  // compression/filter/interlace = 0

  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 3)] = 0; // filter byte
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixelFn(x, y, size);
      const off = y * (1 + size * 3) + 1 + x * 3;
      raw[off] = r; raw[off + 1] = g; raw[off + 2] = b;
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk('IHDR', ihdrData),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Draw a rounded purple square with a centered white lightning bolt
function pixelFor(x, y, size) {
  const cx = size / 2, cy = size / 2;
  const r = size * 0.42;
  const cornerR = size * 0.22;

  // Rounded rect check (approximate via corner circles)
  function inRoundedRect() {
    const dx = Math.max(0, Math.abs(x - cx) - (r - cornerR));
    const dy = Math.max(0, Math.abs(y - cy) - (r - cornerR));
    return dx * dx + dy * dy <= cornerR * cornerR;
  }

  if (!inRoundedRect()) return [255, 255, 255]; // transparent (white bg)

  // Lightning bolt (⚡) — simple polygon test
  const nx = (x - cx) / size; // normalized -0.5..0.5
  const ny = (y - cy) / size;

  // Upper triangle of bolt: right-leaning shape
  const bolt =
    (ny < 0 && nx > -0.15 && nx < 0.18 && nx > ny * 0.5 - 0.02) ||
    (ny >= 0 && nx < 0.15 && nx > -0.18 && nx < -ny * 0.5 + 0.02);

  return bolt ? WHITE : PURPLE;
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });

for (const size of [16, 48, 128]) {
  const buf = createPNG(size, pixelFor);
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), buf);
  console.log(`✓ icons/icon${size}.png`);
}
