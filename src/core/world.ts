// Shared world types: wall segments, doors, buildings and loot containers (all in the x/z ground plane),
// plus the drawn width of each OSM road type.
import type * as THREE from 'three';

export type V2 = [number, number];
export type Seg = {
  a: V2;
  b: V2;
  door?: Door;
  low?: boolean;
  h?: number; /* v21.4 cover height (m), undefined = full wall */
};
export type Door = { b: Bld; p: V2; a: V2; c: V2; barricaded: boolean; seg?: Seg; mesh?: THREE.Mesh };
export type Bld = {
  sign?: THREE.Mesh;
  floor?: THREE.Mesh;
  inner?: THREE.Group;
  innerWalls?: THREE.Mesh;
  detailed?: string;
  id: number;
  pts: V2[];
  h: number;
  type: string;
  group: THREE.Group;
  walls: THREE.Mesh;
  roof: THREE.Group;
  door?: Door;
  c: V2;
  minx: number;
  maxx: number;
  minz: number;
  maxz: number;
};
export type Cont = {
  id: string;
  p: V2;
  items: Record<string, number>;
  label: string;
  mesh: THREE.Object3D;
  b?: Bld;
  half?: number;
  axis?: V2;
  vis?: { im: THREE.InstancedMesh; max: number; item: string }[];
  init?: Record<string, number>;
};

// Road width in metres by OSM highway type (`_link` roads use their parent type).
export const ROADW: Record<string, number> = {
  trunk: 18,
  primary: 16,
  secondary: 12,
  tertiary: 9,
  residential: 6,
  unclassified: 6,
  living_street: 5,
  service: 4,
  pedestrian: 6,
  footway: 2.5,
};
