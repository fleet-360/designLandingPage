/** three.js side of the procedural textures, kept out of textures.ts so the 2D views do not pull three into the main chunk. */
import * as THREE from 'three';
import { textureCanvas, type TextureKind } from './textures';

const cache = new Map<string, THREE.CanvasTexture>();

/** Texture sized so that one repeat is `tileMm` millimetres in UV space (UVs are generated in mm/1000). */
export function proceduralTexture(kind: TextureKind): THREE.CanvasTexture {
  let t = cache.get(kind);
  if (t) return t;
  const size = 512;
  const c = textureCanvas(kind, size);
  t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const tileMm = kind === 'wood' ? 600 : kind === 'stone' ? 1400 : 500;
  t.repeat.set(1000 / tileMm, 1000 / tileMm);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(kind, t);
  return t;
}

