import * as THREE from 'three';

/**
 * Shared wind clock + vertex-shader sway injection. Every swaying material
 * (grass clumps, flowers, tree leaves) reads the same time uniform, advanced
 * once per frame by the overworld update loop.
 */

const timeUniform = { value: 0 };

export function advanceWind(dt: number): void {
  timeUniform.value += dt;
}

/**
 * Makes an instanced material sway in the wind. `strength` is the horizontal
 * displacement in world units per unit of local mesh height — grass wants a
 * strong value (~0.08), tree canopies a subtle one (~0.01).
 */
export function applyWindSway(material: THREE.Material, strength: number): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = timeUniform;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uWindTime;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         #ifdef USE_INSTANCING
           {
             vec4 windWorld = instanceMatrix * vec4(transformed, 1.0);
             float windPhase = uWindTime * 1.8 + windWorld.x * 0.6 + windWorld.z * 0.4;
             float windAmount = (sin(windPhase) + sin(windPhase * 1.7 + 1.3) * 0.5) * ${strength.toFixed(4)} * max(transformed.y, 0.0);
             transformed.x += windAmount;
             transformed.z += windAmount * 0.6;
           }
         #endif`,
      );
  };
  // Sway changes the effective geometry each frame; a cached shadow of the rest
  // pose is fine, but the material must be marked so three recompiles per-use.
  material.customProgramCacheKey = () => `wind-${strength.toFixed(4)}`;
}
