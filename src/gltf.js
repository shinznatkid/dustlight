import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// A glTF loader for every room. The release build stores models with EXT_meshopt_compression
// geometry and WebP textures (tools/optimize_assets.mjs); with the decoder registered here the
// same code loads those and the raw assets of `npm run dev` alike (WebP is built into three).
export function gltfLoader() {
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
}
