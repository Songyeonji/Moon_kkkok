// PWA 아이콘 생성기 — 외부 의존성 없이 Node 내장 zlib 만 사용한다.
// 소스: public/topbar-icon.png (310x310 RGBA)
// 사용: npm run icons
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

const SRC = 'public/topbar-icon.png';

// ── CRC32 ──
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── PNG 디코드 (8bit RGBA, non-interlaced 전용) ──
function decodePng(buf) {
  const sig = '89504e470d0a1a0a';
  if (buf.subarray(0, 8).toString('hex') !== sig) throw new Error('PNG 시그니처가 아닙니다');

  let width = 0;
  let height = 0;
  const idat = [];
  let offset = 8;

  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buf.subarray(offset + 8, offset + 8 + len);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const [bitDepth, colorType, , , interlace] = [data[8], data[9], data[10], data[11], data[12]];
      if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
        throw new Error(`지원하지 않는 PNG 형식 (bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace})`);
      }
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + len;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];

      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) {
        throw new Error(`알 수 없는 필터 타입: ${filter}`);
      }
      cur[x] = v & 0xff;
    }
  }
  return { width, height, data: out };
}

// ── PNG 인코드 ──
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng({ width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── 알파 프리멀티플라이 기반 바이리니어 리샘플 (가장자리 검은 테두리 방지) ──
function resample(src, size) {
  const out = Buffer.alloc(size * size * 4);
  const scale = src.width / size;

  for (let y = 0; y < size; y++) {
    const sy = Math.min(src.height - 1, (y + 0.5) * scale - 0.5);
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(src.height - 1, y0 + 1);
    const fy = sy - y0;

    for (let x = 0; x < size; x++) {
      const sx = Math.min(src.width - 1, (x + 0.5) * scale - 0.5);
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(src.width - 1, x0 + 1);
      const fx = sx - x0;

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (const [px, py, w] of [
        [x0, y0, (1 - fx) * (1 - fy)],
        [x1, y0, fx * (1 - fy)],
        [x0, y1, (1 - fx) * fy],
        [x1, y1, fx * fy],
      ]) {
        const i = (py * src.width + px) * 4;
        const pa = src.data[i + 3] / 255;
        r += src.data[i] * pa * w;
        g += src.data[i + 1] * pa * w;
        b += src.data[i + 2] * pa * w;
        a += pa * w;
      }

      const o = (y * size + x) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
      }
      out[o + 3] = Math.round(a * 255);
    }
  }
  return { width: size, height: size, data: out };
}

/**
 * 캔버스 중앙에 로고를 얹는다.
 * @param logoRatio 캔버스 대비 로고가 차지하는 비율 (maskable 은 safe zone 때문에 작게)
 * @param bg [r,g,b] 배경색. null 이면 투명 배경 유지.
 */
function compose(src, size, logoRatio, bg) {
  const canvas = Buffer.alloc(size * size * 4);
  if (bg) {
    for (let i = 0; i < size * size; i++) {
      canvas[i * 4] = bg[0];
      canvas[i * 4 + 1] = bg[1];
      canvas[i * 4 + 2] = bg[2];
      canvas[i * 4 + 3] = 255;
    }
  }

  const logoSize = Math.round(size * logoRatio);
  const logo = resample(src, logoSize);
  const off = Math.round((size - logoSize) / 2);

  for (let y = 0; y < logoSize; y++) {
    for (let x = 0; x < logoSize; x++) {
      const si = (y * logoSize + x) * 4;
      const di = ((y + off) * size + (x + off)) * 4;
      const sa = logo.data[si + 3] / 255;
      if (sa === 0) continue;

      const da = canvas[di + 3] / 255;
      const oa = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) {
        canvas[di + c] = Math.round((logo.data[si + c] * sa + canvas[di + c] * da * (1 - sa)) / oa);
      }
      canvas[di + 3] = Math.round(oa * 255);
    }
  }
  return { width: size, height: size, data: canvas };
}

// ── 실행 ──
const src = decodePng(readFileSync(SRC));
console.log(`source: ${SRC} (${src.width}x${src.height})`);

const WHITE = [255, 255, 255];
const targets = [
  // [파일명, 크기, 로고 비율, 배경색]
  ['public/pwa-192.png', 192, 1, null],
  ['public/pwa-512.png', 512, 1, null],
  // maskable: 원형/스쿼클로 잘려도 로고가 살아남도록 safe zone(80%) 안쪽에 배치
  ['public/pwa-maskable-512.png', 512, 0.62, WHITE],
  // iOS 홈 화면 아이콘은 투명 배경을 검게 칠하므로 반드시 불투명 배경
  ['public/apple-touch-icon.png', 180, 0.82, WHITE],
];

for (const [file, size, ratio, bg] of targets) {
  const img = ratio === 1 && !bg ? resample(src, size) : compose(src, size, ratio, bg);
  const png = encodePng(img);
  writeFileSync(file, png);
  console.log(`  ✓ ${file} — ${size}x${size}, ${(png.length / 1024).toFixed(1)}KB`);
}
