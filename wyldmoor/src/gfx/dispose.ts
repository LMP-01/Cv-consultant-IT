import * as THREE from 'three';

/**
 * Frees geometries and materials owned by a procedurally-built object tree (creature
 * models, humanoids, per-map props). Never disposes textures here — every texture used
 * by these generators comes from `TextureFactory`'s shared cache and must outlive any
 * single object instance.
 */
export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of materials) mat.dispose();
    }
  });
}
