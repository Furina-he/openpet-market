/**
 * openpet-market 构建脚本（零依赖，只用 node 内置模块）。
 *
 *   node scripts/build.mjs            # 打包 souls/<id>/ → packs/<id>.dssoul，回填 index.json 的 sha256/size/downloadUrl
 *   node scripts/build.mjs --check    # 只校验：index.json 里每条的 sha256/size 与 packs/ 实物一致，不一致退出码 1
 *
 * 约定：
 *   - souls/<id>/soul.json 是灵魂包的人类可编辑源；同目录下的 preview.png|jpg|webp 会一并打进包并复制到 previews/。
 *   - index.json 的条目（summary/tags/author/license/type…）手工维护；本脚本只回填三个「机器字段」：
 *     sha256 / size / downloadUrl（以及 preview URL，若源目录里有预览图）。
 *   - 完整包 .dspack / 肉体包 .dsbody 不经本脚本生成（在 openpet 里导出），放进 packs/<id>.dspack|.dsbody 后跑 build 即回填；
 *     超过 20MB 的文件自动改走 GitHub raw（jsDelivr gh/ 源单文件上限 20MB）。
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = 'https://cdn.jsdelivr.net/gh/Furina-he/openpet-market@main';
const PREVIEW_RE = /^preview\.(png|jpg|jpeg|webp)$/i;

// --- 最小 zip 写入（与 openpet 主仓 scripts/st-card-to-soul.mjs 同实现）---
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function writeZip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const comp = deflateRawSync(f.data);
    const crc = crc32(f.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, comp);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(comp.length, 20);
    cen.writeUInt32LE(f.data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length + comp.length;
  }
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, eocd]);
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const indexPath = path.join(ROOT, 'index.json');
const index = JSON.parse(readFileSync(indexPath, 'utf8'));
const byId = new Map(index.items.map((it) => [it.id, it]));
const checkOnly = process.argv.includes('--check');
let problems = 0;

// 1) souls/<id>/ → packs/<id>.dssoul
const soulsDir = path.join(ROOT, 'souls');
if (existsSync(soulsDir) && !checkOnly) {
  mkdirSync(path.join(ROOT, 'packs'), { recursive: true });
  mkdirSync(path.join(ROOT, 'previews'), { recursive: true });
  for (const id of readdirSync(soulsDir)) {
    const dir = path.join(soulsDir, id);
    if (!statSync(dir).isDirectory()) continue;
    const soulRaw = readFileSync(path.join(dir, 'soul.json'), 'utf8');
    const soul = JSON.parse(soulRaw);
    if (soul.id !== id) {
      console.error(`✗ souls/${id}/soul.json 的 id 是 "${soul.id}"，须与目录名一致`);
      problems++;
      continue;
    }
    const files = [{ name: 'soul.json', data: Buffer.from(soulRaw, 'utf8') }];
    const previewName = readdirSync(dir).find((n) => PREVIEW_RE.test(n));
    if (previewName) {
      const data = readFileSync(path.join(dir, previewName));
      files.push({ name: previewName, data });
      writeFileSync(path.join(ROOT, 'previews', `${id}${path.extname(previewName)}`), data);
    }
    const buf = writeZip(files);
    writeFileSync(path.join(ROOT, 'packs', `${id}.dssoul`), buf);
    const entry = byId.get(id);
    if (!entry) {
      console.error(`✗ index.json 里没有 id="${id}" 的条目——先手工加条目（summary/tags/license…），再跑 build 回填机器字段`);
      problems++;
      continue;
    }
    entry.downloadUrl = `${BASE_URL}/packs/${id}.dssoul`;
    entry.size = buf.length;
    entry.sha256 = sha256(buf);
    if (previewName) entry.preview = `${BASE_URL}/previews/${id}${path.extname(previewName)}`;
    console.info(`✓ ${id}.dssoul  ${buf.length} B  ${entry.sha256.slice(0, 12)}…`);
  }
}

// 2) 手放的 .dspack/.dsbody：按 id 对应 packs/<id>.dspack|.dsbody 回填 / 校验
//    jsDelivr 单文件上限 20MB（gh/ 源）——超限的走 GitHub raw（无上限，但国内直连可能不通）
const JSDELIVR_MAX = 20 * 1024 * 1024;
const RAW_BASE = 'https://raw.githubusercontent.com/Furina-he/openpet-market/main';
for (const it of index.items) {
  if (it.type === 'soul' || it.type === 'ref') continue; // 已由 souls/ 处理
  const ext = it.type === 'body' ? 'dsbody' : 'dspack';
  const fname = `${it.id}.${ext}`;
  const file = path.join(ROOT, 'packs', fname);
  if (!existsSync(file)) {
    if (/\/packs\//.test(it.downloadUrl ?? '')) { console.error(`✗ ${it.id}: packs/${fname} 不存在`); problems++; }
    continue; // 外部托管的下载地址不校验
  }
  const buf = readFileSync(file);
  const digest = sha256(buf);
  const base = buf.length > JSDELIVR_MAX ? RAW_BASE : BASE_URL;
  const url = `${base}/packs/${fname}`;
  if (checkOnly) {
    if (it.sha256 !== digest || it.size !== buf.length || it.downloadUrl !== url) {
      console.error(`✗ ${it.id}: sha256/size/downloadUrl 与 packs/${fname} 不符（跑 node scripts/build.mjs 回填）`);
      problems++;
    }
  } else {
    it.sha256 = digest; it.size = buf.length; it.downloadUrl = url;
    console.info(`✓ ${fname}  ${(buf.length / 1048576).toFixed(1)} MB  ${digest.slice(0, 12)}…${buf.length > JSDELIVR_MAX ? '  (>20MB → GitHub raw)' : ''}`);
  }
}
// 3) 灵魂包校验（--check 时）
if (checkOnly) for (const it of index.items) {
  if (it.type !== 'soul' && it.type !== 'ref') continue;
  const m = /\/packs\/([^/]+)$/.exec(it.downloadUrl ?? '');
  if (!m) continue;
  const file = path.join(ROOT, 'packs', m[1]);
  if (!existsSync(file)) { console.error(`✗ ${it.id}: packs/${m[1]} 不存在`); problems++; continue; }
  const buf = readFileSync(file);
  if (it.sha256 !== sha256(buf) || it.size !== buf.length) { console.error(`✗ ${it.id}: sha256/size 与 packs/${m[1]} 不符`); problems++; }
}

if (!checkOnly && problems === 0) {
  index.updatedAt = Date.now();
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  console.info(`index.json 已更新（${index.items.length} 条，updatedAt=${index.updatedAt}）`);
}
console.info(problems ? `\n有 ${problems} 处问题` : checkOnly ? '\n校验通过' : '');
process.exit(problems ? 1 : 0);
