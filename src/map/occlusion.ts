// v21.2 occlusion cutaway. The camera is untouched; instead every lit material discards fragments that lie inside a
// cylinder from the player's chest towards the camera (soft dithered rim). Because it hooks the shader of every
// material, it covers walls, roofs, 頂樓加蓋, 鐵窗 cages, awnings, arcade ceilings, signs and trees, including the
// meshes of streamed district tiles, with no registration. Ground-level fragments (y < 0.35) are kept so the street
// under the player never gets a hole. Set material.userData.noOcc to opt out.
import * as THREE from 'three';

export const OCC = {
  p: { value: new THREE.Vector3() },
  r: { value: 3.0 },
  on: { value: 1 },
  /** test hook: 0/1 overrides the per-frame state */
  force: null as number | null,
};
const GLSL = /* glsl */ `
  if (uOccOn > 0.5) {
    vec3 occW = cameraPosition + transpose(mat3(viewMatrix)) * (-vViewPosition);
    vec3 occD = isOrthographic ? transpose(mat3(viewMatrix)) * vec3(0.0, 0.0, 1.0) : normalize(cameraPosition - uOccP);
    vec3 occQ = occW - uOccP;
    float occA = dot(occQ, occD);
    float occR = length(occQ - occD * occA);
    if (occA > 0.9 && occW.y > 0.35 && occR < uOccR) {
      float occE = smoothstep(uOccR * 0.7, uOccR, occR);
      float occS = mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0);
      if (occE < 0.5 || occS < 0.5) discard;
    }
  }
`;
THREE.Material.prototype.onBeforeCompile = function (
  this: THREE.Material,
  sh: THREE.WebGLProgramParametersWithUniforms,
) {
  if (this.userData?.noOcc) return;
  const fs = sh.fragmentShader;
  if (!fs.includes('vViewPosition') || !fs.includes('#include <clipping_planes_fragment>')) return;
  sh.uniforms.uOccP = OCC.p;
  sh.uniforms.uOccR = OCC.r;
  sh.uniforms.uOccOn = OCC.on;
  sh.fragmentShader =
    'uniform vec3 uOccP;\nuniform float uOccR;\nuniform float uOccOn;\n' +
    fs.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + GLSL);
};
/** call once per frame before rendering */
export function updateOcclusion(px: number, py: number, pz: number, on = true) {
  OCC.p.value.set(px, py + 1.1, pz);
  OCC.on.value = OCC.force ?? (on ? 1 : 0);
}
