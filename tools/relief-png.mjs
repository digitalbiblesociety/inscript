import { inflateSync } from 'node:zlib';

function parseChunks(buf) {
  let p = 8;
  let w = 0, h = 0, colorType = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      colorType = data[9];
      if (data[8] !== 8) throw new Error(`bit depth ${data[8]} unsupported`);
      if (data[12] !== 0) throw new Error('interlaced PNG unsupported');
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') break;
    p += 12 + len;
  }
  return { w, h, colorType, idat };
}

function channelsFor(colorType) {
  if (colorType === 6) return 4;
  if (colorType === 2) return 3;
  throw new Error(`color type ${colorType}`);
}

function paeth(a, b, c) {
  const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function unfilter(raw, w, h, ch) {
  const stride = w * ch;
  const out = Buffer.alloc(stride * h);
  let q = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[q++];
    for (let x = 0; x < stride; x++) {
      const v = raw[q++];
      const a = x >= ch ? out[y * stride + x - ch] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= ch && y > 0 ? out[(y - 1) * stride + x - ch] : 0;
      let r;
      switch (filter) {
        case 0: r = v; break;
        case 1: r = v + a; break;
        case 2: r = v + b; break;
        case 3: r = v + ((a + b) >> 1); break;
        case 4: r = v + paeth(a, b, c); break;
        default: throw new Error(`filter ${filter}`);
      }
      out[y * stride + x] = r & 0xff;
    }
  }
  return out;
}

export function decodePng(buf) {
  const { w, h, colorType, idat } = parseChunks(buf);
  const ch = channelsFor(colorType);
  const raw = inflateSync(Buffer.concat(idat));
  return { width: w, height: h, channels: ch, data: unfilter(raw, w, h, ch) };
}
