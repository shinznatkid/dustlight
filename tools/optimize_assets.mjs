// Release pass over the built assets (dist/assets = a copy of public/assets; the source
// folder is never touched). Run by the build (vite.config.js) or by hand:
//   node tools/optimize_assets.mjs [dist]
// 1. glTF / GLB: identical accessors and images merged, unused parts dropped; geometry
//    stored with EXT_meshopt_compression WITHOUT quantization or filters — the codec is
//    lossless on float data, so every vertex comes back bit-identical (checked below). The
//    rooms read and rewrite raw attributes (the KayKit swatch swap copies `uv.array`, the
//    cabin merges loaded pieces with its own), which quantized ints would break.
//    JPEG textures → WebP (EXT_texture_webp) at a quality that doesn't show in the frame,
//    same resolution; kept as JPEG when WebP saves little. PNG (the KayKit atlases — the
//    rooms repaint them on a canvas, by file name) is left as it is.
// 2. Everything the game never loads is removed: only files reachable from the manifests,
//    the audio index and the models (their buffers and images) are kept, plus the asset
//    packs' license texts. That drops the sound board's candidates and download caches,
//    zips, and stale files an older fetch left behind.
// 3. Standalone textures (assets/textures, rooms/bookshop/textures — the floors, walls and
//    fabrics the rooms put on in code): colour, roughness and AO maps JPEG → WebP at the same
//    quality (the rooms ask for one extension: import.meta.env.TEXTURE_EXT, set by
//    vite.config.js for a build that runs this pass), and the manifests list the new names.
//    Normal maps stay JPEG: lossy WebP subsamples the chroma again, which blurs the normals'
//    per-pixel tilt — the sun's sparkle on the floors changed, and with it the bounce light
//    (shaded corners 4–6% darker or brighter, at quality 90 as at 98; 2026-10-02).
// Idempotent: a model already carrying EXT_meshopt_compression is left alone; a texture
// already in WebP has no JPEG left to convert.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

// WebP quality 90 (smart chroma subsampling): ~1/255 mean error on the texture itself,
// nothing in the rendered frame (tools/diff.mjs on all six rooms, 2026-09-30)
const WEBP = { quality: 90, smartSubsample: true, effort: 5 };
const MIN_GAIN = 0.1; // a second generation of loss only for at least 10% smaller
const MODEL_DIRS = ['models', 'rooms'];
const LICENSE = /^licen[cs]e/i;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
io.setLogger({ debug() {}, info() {}, warn: (m) => console.warn(`  [gltf] ${m}`), error: (m) => console.error(`  [gltf] ${m}`) });

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const size = (files) => files.reduce((s, f) => s + (fs.existsSync(f) ? fs.statSync(f).size : 0), 0);
const MB = (b) => `${(b / 1e6).toFixed(1)} MB`;

// the glTF JSON of a .gltf / .glb file
function gltfJSON(file) {
  const b = fs.readFileSync(file);
  if (file.endsWith('.gltf')) return JSON.parse(b.toString('utf8'));
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
}
// files a model points at (buffers, images), resolved next to it
function modelRefs(file) {
  const j = gltfJSON(file);
  return [...(j.buffers ?? []), ...(j.images ?? [])]
    .map((r) => r.uri)
    .filter((u) => u && !u.startsWith('data:'))
    .map((u) => path.resolve(path.dirname(file), decodeURIComponent(u)));
}

// every vertex attribute and index list of the scene, in order: must survive untouched.
// (The index codec may start a triangle at another of its corners — abc → bca, same
// winding, same triangle, drawn the same — so triangles are compared from their lowest index.)
function geometryPrint(doc) {
  const out = [];
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const acc = [['indices', prim.getIndices()], ...prim.listSemantics().sort().map((s) => [s, prim.getAttribute(s)])];
      for (const [name, a] of acc) {
        if (!a) continue;
        let arr = a.getArray();
        if (name === 'indices' && prim.getMode() === 4) {
          arr = arr.slice();
          for (let i = 0; i + 2 < arr.length; i += 3) {
            const [x, y, z] = [arr[i], arr[i + 1], arr[i + 2]];
            if (y < x && y <= z) arr.set([y, z, x], i);
            else if (z < x && z < y) arr.set([z, x, y], i);
          }
        }
        out.push(`${mesh.getName()}|${name}|${a.getComponentType()}|${a.getNormalized()}|${a.getType()}|${a.getCount()}|${Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64')}`);
      }
    }
  }
  return out.join('\n');
}

async function optimizeModel(file) {
  const doc = await io.read(file);
  if (doc.getRoot().listExtensionsUsed().some((e) => e.extensionName === 'EXT_meshopt_compression')) return { skipped: true };
  // (materials and meshes are not merged: the rooms find parts and recolour them by name)
  await doc.transform(
    dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.TEXTURE] }),
    prune({ keepLeaves: true, keepAttributes: true, keepIndices: true, keepSolidTextures: true, keepExtras: true }),
  );
  const before = geometryPrint(doc);
  let webp = 0;
  for (const tex of doc.getRoot().listTextures()) {
    if (tex.getMimeType() !== 'image/jpeg') continue;
    const src = tex.getImage();
    const out = await sharp(src).webp(WEBP).toBuffer();
    if (out.length > src.length * (1 - MIN_GAIN)) continue;
    tex.setImage(out).setMimeType('image/webp').setURI(tex.getURI().replace(/\.jpe?g$/i, '.webp'));
    webp++;
  }
  if (webp) doc.createExtension(EXTTextureWebP).setRequired(true);
  doc.createExtension(EXTMeshoptCompression).setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE }); // = no filters
  if (file.endsWith('.glb')) {
    fs.writeFileSync(file, await io.writeBinary(doc));
  } else {
    const { json, resources } = await io.writeJSON(doc, { format: 'gltf' });
    for (const [uri, data] of Object.entries(resources)) {
      const p = path.resolve(path.dirname(file), decodeURIComponent(uri));
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, data);
    }
    fs.writeFileSync(file, JSON.stringify(json));
  }
  if (geometryPrint(await io.read(file)) !== before) throw new Error(`optimize_assets: geometry of ${file} changed`);
  return { webp };
}

// what the game can load: the manifests' models and textures, the audio index's files,
// every model and what it points at
function reachable(A) {
  const keep = new Set();
  const add = (p) => keep.add(path.resolve(p));
  for (const [man, base] of [['manifest.json', ''], ['rooms/bookshop/manifest.json', 'rooms/bookshop']]) {
    const f = path.join(A, man);
    if (!fs.existsSync(f)) continue;
    add(f);
    const m = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const [id, file] of Object.entries(m.models ?? {})) add(path.join(A, base, 'models', id, file));
    for (const [id, maps] of Object.entries(m.textures ?? {})) for (const file of Object.values(maps)) add(path.join(A, base, 'textures', id, file));
  }
  const idx = path.join(A, 'audio', 'index.json');
  if (fs.existsSync(idx)) {
    add(idx);
    const j = JSON.parse(fs.readFileSync(idx, 'utf8'));
    for (const bus of ['music', 'ambience', 'sfx']) for (const v of Object.values(j[bus] ?? {})) for (const f of [v].flat()) add(path.join(A, 'audio', f));
  }
  for (const f of MODEL_DIRS.flatMap((d) => walk(path.join(A, d)))) {
    if (!/\.(gltf|glb)$/i.test(f)) continue;
    add(f);
    for (const r of modelRefs(f)) add(r);
  }
  return keep;
}

export async function optimizeAssets(dist, { log = console.log } = {}) {
  const t0 = performance.now();
  const A = path.resolve(dist, 'assets');
  // never the source: public/assets (a junction in extra worktrees) must stay raw
  const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');
  if (fs.existsSync(src) && fs.realpathSync(A) === fs.realpathSync(src)) throw new Error(`optimize_assets: ${A} is the source folder`);
  const dirs = ['models', 'rooms', 'textures', 'audio'].map((d) => path.join(A, d));
  const all0 = dirs.flatMap((d) => walk(d));
  const bytes0 = size(all0);

  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const models = MODEL_DIRS.flatMap((d) => walk(path.join(A, d))).filter((f) => /\.(gltf|glb)$/i.test(f));
  const modelBytes0 = size(models.flatMap((f) => [f, ...modelRefs(f)]));
  let done = 0;
  let skipped = 0;
  let webp = 0;
  const queue = [...models];
  await Promise.all(Array.from({ length: Math.max(2, Math.min(8, os.availableParallelism() - 2)) }, async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      const r = await optimizeModel(f);
      if (r.skipped) skipped++;
      else done++;
      webp += r.webp ?? 0;
    }
  }));

  const keep = reachable(A);
  const gone = dirs.flatMap((d) => walk(d)).filter((f) => !keep.has(path.resolve(f)) && !LICENSE.test(path.basename(f)));
  const goneBytes = size(gone);
  for (const f of gone) fs.rmSync(f);
  for (const d of dirs) removeEmpty(d);
  const tex = await standaloneWebp(A);
  const models1 = MODEL_DIRS.flatMap((d) => walk(path.join(A, d))).filter((f) => /\.(gltf|glb)$/i.test(f));
  const modelBytes1 = size(models1.flatMap((f) => [f, ...modelRefs(f)]));
  const missing = [...keep].filter((f) => !fs.existsSync(f) && !fs.existsSync(f.replace(/\.jpe?g$/i, '.webp')));
  for (const f of missing) log(`  optimize_assets: referenced but missing: ${path.relative(A, f)}`);
  log(`optimize_assets: ${done} models compressed (${webp} textures → WebP${skipped ? `, ${skipped} already done` : ''}): `
    + `${MB(modelBytes0)} → ${MB(modelBytes1)} · ${tex.n} room textures → WebP: ${MB(tex.before)} → ${MB(tex.after)} · `
    + `${gone.length} unused files removed (${MB(goneBytes)}) · `
    + `assets ${MB(bytes0)} → ${MB(size(dirs.flatMap((d) => walk(d))))} · ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}

// 3. (above) every JPEG a manifest lists as a texture, normal maps aside → WebP next to it,
// the manifest updated
const KEEP_JPEG = new Set(['nor']); // (the rooms know: room.js, rooms/bookshop/common.js)
async function standaloneWebp(A) {
  const r = { n: 0, before: 0, after: 0 };
  for (const [man, base] of [['manifest.json', ''], ['rooms/bookshop/manifest.json', 'rooms/bookshop']]) {
    const f = path.join(A, man);
    if (!fs.existsSync(f)) continue;
    const m = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const [id, maps] of Object.entries(m.textures ?? {})) {
      for (const [k, file] of Object.entries(maps)) {
        if (!/\.jpe?g$/i.test(file) || KEEP_JPEG.has(k)) continue;
        const p = path.join(A, base, 'textures', id, file);
        if (!fs.existsSync(p)) continue;
        const src = fs.readFileSync(p);
        const out = await sharp(src).webp(WEBP).toBuffer();
        maps[k] = file.replace(/\.jpe?g$/i, '.webp');
        fs.writeFileSync(path.join(path.dirname(p), maps[k]), out);
        fs.rmSync(p);
        r.n++;
        r.before += src.length;
        r.after += out.length;
      }
    }
    fs.writeFileSync(f, JSON.stringify(m, null, 1));
  }
  return r;
}

function removeEmpty(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) removeEmpty(path.join(dir, e.name));
  if (!fs.readdirSync(dir).length) fs.rmdirSync(dir);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await optimizeAssets(process.argv[2] ?? 'dist');
}
