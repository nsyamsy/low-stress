import type { BufferGeometry, Color, Group } from "three";
import {
  type CharacterAccessory,
  type MochiCustomization,
  type MochiSpecies,
  mochiAccentColor,
  mochiBodyColor,
} from "../../shared/character";

/**
 * Bagian visual satu karakter Mochi. Setiap bagian punya geometri sendiri
 * agar bisa dirender sebagai InstancedMesh terpisah dengan warna per-instance
 * (RT-40: InstancedMesh + warna per-instance, anggaran R5).
 */
export type MochiPartName = "body" | "accent" | "detail" | "face" | "accessory";

export type MochiPartGeometries = Record<MochiPartName, BufferGeometry | null>;

const EMPTY: MochiPartGeometries = {
  body: null,
  accent: null,
  detail: null,
  face: null,
  accessory: null,
};

/** Arah hadap karakter: +Z (selaras dengan prediksi klien). */
const FRONT_Z = 1;

async function buildParts(species: MochiSpecies): Promise<MochiPartGeometries> {
  const THREE = await import("three");
  const { mergeGeometries } = await import(
    "three/addons/utils/BufferGeometryUtils.js"
  );

  const sphere = (
    r: number,
    x: number,
    y: number,
    z: number,
    sx = 1,
    sy = 1,
    sz = 1,
  ) => {
    const g = new THREE.SphereGeometry(r, 14, 12);
    g.scale(sx, sy, sz);
    g.translate(x, y, z);
    return g;
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    return g;
  };
  const cone = (
    r: number,
    h: number,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
    sx = 1,
    sy = 1,
    sz = 1,
  ) => {
    const g = new THREE.ConeGeometry(r, h, 10);
    g.scale(sx, sy, sz);
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    return g;
  };
  const cyl = (
    rTop: number,
    rBottom: number,
    h: number,
    x: number,
    y: number,
    z: number,
    rx = 0,
    rz = 0,
  ) => {
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, 8);
    if (rx) g.rotateX(rx);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    return g;
  };
  const merge = (geoms: BufferGeometry[]) => mergeGeometries(geoms, false);

  const parts: MochiPartGeometries = { ...EMPTY };

  switch (species) {
    case "orb": {
      // Tubuh membulat dengan telinga pendek dan ekor; bukan siluet kacang.
      parts.body = sphere(0.8, 0, 0.85, 0, 1, 0.95, 0.92);
      parts.accent = sphere(0.5, 0, 0.62, 0.42 * FRONT_Z, 1, 0.8, 0.5);
      parts.detail = merge([
        sphere(0.16, -0.42, 1.5, 0),
        sphere(0.16, 0.42, 1.5, 0),
        cone(0.14, 0.5, 0, 0.75, -0.75, Math.PI / 2.4, 0, 0),
      ]);
      parts.face = merge([
        sphere(0.1, -0.3, 1.0, 0.62 * FRONT_Z),
        sphere(0.1, 0.3, 1.0, 0.62 * FRONT_Z),
      ]);
      break;
    }
    case "moth": {
      // Ngengat kecil: tubuh kompak + sayap pipih beraksen + antena.
      parts.body = sphere(0.55, 0, 1.0, 0, 0.9, 1.05, 0.9);
      parts.accent = merge([
        box(0.7, 0.06, 0.5, -0.65, 1.05, -0.05),
        box(0.7, 0.06, 0.5, 0.65, 1.05, -0.05),
      ]);
      parts.detail = merge([
        cyl(0.02, 0.02, 0.5, -0.15, 1.65, 0.1, 0, 0.5),
        cyl(0.02, 0.02, 0.5, 0.15, 1.65, 0.1, 0, -0.5),
        sphere(0.07, -0.15, 1.9, 0.2),
        sphere(0.07, 0.15, 1.9, 0.2),
      ]);
      parts.face = merge([
        sphere(0.09, -0.2, 1.1, 0.5 * FRONT_Z),
        sphere(0.09, 0.2, 1.1, 0.5 * FRONT_Z),
      ]);
      break;
    }
    case "newt": {
      // Newt memanjang dengan sirip ekor dan dua tanduk kecil.
      parts.body = sphere(0.6, 0, 0.55, 0, 1.3, 0.75, 0.9);
      parts.accent = sphere(0.42, 0, 0.45, 0.35 * FRONT_Z, 1.1, 0.5, 0.5);
      parts.detail = merge([
        cone(0.28, 0.7, 0, 0.55, -0.95, Math.PI / 2.2, 0, 0),
        cone(0.1, 0.35, -0.35, 0.95, 0.15, 0, 0, 0.5),
        cone(0.1, 0.35, 0.35, 0.95, 0.15, 0, 0, -0.5),
      ]);
      parts.face = merge([
        sphere(0.09, -0.28, 0.62, 0.62 * FRONT_Z),
        sphere(0.09, 0.28, 0.62, 0.62 * FRONT_Z),
      ]);
      break;
    }
    case "puff": {
      // Puff berduri (icosahedron) dengan inti aksen dan duri kecil.
      const body = new THREE.IcosahedronGeometry(0.85, 1);
      body.scale(1, 0.95, 1);
      body.translate(0, 0.85, 0);
      parts.body = body;
      parts.accent = sphere(0.4, 0, 0.7, 0.4 * FRONT_Z, 1, 0.8, 0.5);
      parts.detail = merge([
        cone(0.09, 0.3, -0.4, 1.55, 0.1, 0, 0, 0.5),
        cone(0.09, 0.3, 0.4, 1.55, 0.1, 0, 0, -0.5),
        cone(0.09, 0.34, 0, 1.62, -0.2),
        cone(0.09, 0.3, -0.55, 1.3, -0.3, 0, 0, 0.7),
        cone(0.09, 0.3, 0.55, 1.3, -0.3, 0, 0, -0.7),
      ]);
      parts.face = merge([
        sphere(0.09, -0.25, 0.95, 0.72 * FRONT_Z),
        sphere(0.09, 0.25, 0.95, 0.72 * FRONT_Z),
      ]);
      break;
    }
    case "sprite": {
      // Sprite melayang: tubuh kecil melayang tinggi + dua polong sisi.
      parts.body = sphere(0.6, 0, 1.15, 0, 0.95, 1, 0.95);
      parts.accent = sphere(0.4, 0, 1.05, 0.35 * FRONT_Z, 1, 0.85, 0.5);
      parts.detail = merge([
        sphere(0.16, -0.55, 1.15, -0.1),
        sphere(0.16, 0.55, 1.15, -0.1),
        cone(0.08, 0.3, -0.2, 0.4, 0, Math.PI, 0, 0),
        cone(0.08, 0.3, 0.2, 0.4, 0, Math.PI, 0, 0),
      ]);
      parts.face = merge([
        sphere(0.09, -0.22, 1.25, 0.55 * FRONT_Z),
        sphere(0.09, 0.22, 1.25, 0.55 * FRONT_Z),
      ]);
      break;
    }
    case "crab": {
      // Kepiting lebar dengan capit kiri-kanan dan tangkai mata.
      parts.body = sphere(0.7, 0, 0.5, 0, 1.35, 0.7, 1);
      parts.accent = sphere(0.45, 0, 0.35, 0.3 * FRONT_Z, 1.1, 0.45, 0.5);
      parts.detail = merge([
        sphere(0.3, -0.85, 0.55, 0.25 * FRONT_Z),
        sphere(0.3, 0.85, 0.55, 0.25 * FRONT_Z),
        cyl(0.03, 0.03, 0.4, -0.2, 0.95, 0.25 * FRONT_Z),
        cyl(0.03, 0.03, 0.4, 0.2, 0.95, 0.25 * FRONT_Z),
        cone(0.08, 0.3, -0.6, 0.35, -0.4, 0, 0, 2.2),
        cone(0.08, 0.3, 0.6, 0.35, -0.4, 0, 0, -2.2),
      ]);
      parts.face = merge([
        sphere(0.11, -0.2, 1.15, 0.28 * FRONT_Z),
        sphere(0.11, 0.2, 1.15, 0.28 * FRONT_Z),
      ]);
      break;
    }
  }

  return parts;
}

/** Geometri satu aksesori (di tempatkan relatif ke kepala, y ≈ 1.4–1.9). */
export async function buildAccessoryGeometry(
  accessory: CharacterAccessory,
): Promise<BufferGeometry | null> {
  const THREE = await import("three");
  const { mergeGeometries } = await import(
    "three/addons/utils/BufferGeometryUtils.js"
  );

  const sphere = (r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const g = new THREE.SphereGeometry(r, 12, 10);
    g.scale(sx, sy, sz);
    g.translate(x, y, z);
    return g;
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    return g;
  };
  const cyl = (rTop: number, rBottom: number, h: number, x: number, y: number, z: number, rx = 0) => {
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, 10);
    if (rx) g.rotateX(rx);
    g.translate(x, y, z);
    return g;
  };
  const torus = (r: number, tube: number, x: number, y: number, z: number, rx = 0) => {
    const g = new THREE.TorusGeometry(r, tube, 8, 20);
    if (rx) g.rotateX(rx);
    g.translate(x, y, z);
    return g;
  };

  let geoms: BufferGeometry[] | null = null;
  switch (accessory) {
    case "space_helmet":
      // Helm luar angkasa: kubah bening + cincin logam.
      geoms = [
        sphere(1.0, 0, 1.15, 0, 1, 1.05, 1),
        torus(1.0, 0.08, 0, 1.12, 0, Math.PI / 2),
      ];
      break;
    case "space_hat":
      // Topi luar angkasa: kubah pipih + lidah depan + antena kecil.
      geoms = [
        sphere(0.55, 0, 1.75, 0, 1, 0.55, 1),
        box(0.5, 0.08, 0.4, 0, 1.72, 0.55 * FRONT_Z),
        cyl(0.02, 0.02, 0.35, 0.3, 2.05, 0),
        sphere(0.07, 0.3, 2.25, 0),
      ];
      break;
    case "antenna":
      geoms = [
        cyl(0.02, 0.02, 0.5, -0.3, 1.85, 0, 0.3),
        cyl(0.02, 0.02, 0.5, 0.3, 1.85, 0, -0.3),
        sphere(0.08, -0.38, 2.05, 0),
        sphere(0.08, 0.38, 2.05, 0),
      ];
      break;
    case "scarf":
      geoms = [
        torus(0.5, 0.12, 0, 1.35, 0, Math.PI / 2),
        box(0.18, 0.5, 0.06, 0.15, 1.05, -0.45),
      ];
      break;
    case "goggles":
      geoms = [
        torus(0.28, 0.07, -0.2, 1.2, 0.55 * FRONT_Z, Math.PI / 2),
        torus(0.28, 0.07, 0.2, 1.2, 0.55 * FRONT_Z, Math.PI / 2),
        box(0.45, 0.06, 0.06, 0, 1.2, 0.5 * FRONT_Z),
      ];
      break;
    case "backpack":
      geoms = [
        box(0.55, 0.7, 0.3, 0, 1.0, -0.75),
        cyl(0.09, 0.09, 0.5, -0.18, 1.15, -0.85, Math.PI / 2),
        cyl(0.09, 0.09, 0.5, 0.18, 1.15, -0.85, Math.PI / 2),
      ];
      break;
    case "earmuffs":
      geoms = [
        torus(0.6, 0.06, 0, 1.45, 0, 0),
        sphere(0.16, -0.62, 1.35, 0),
        sphere(0.16, 0.62, 1.35, 0),
      ];
      break;
    case "halo":
      geoms = [torus(0.45, 0.05, 0, 2.0, 0, Math.PI / 2)];
      break;
  }

  if (!geoms) return null;
  return mergeGeometries(geoms, false);
}

// ---------------------------------------------------------------------------
// Preview satu karakter (dipakai pemilih karakter RT-42)
// ---------------------------------------------------------------------------

const geometryCache = new Map<string, Promise<MochiPartGeometries>>();
const accessoryCache = new Map<string, Promise<BufferGeometry | null>>();

export function getMochiParts(species: MochiSpecies): Promise<MochiPartGeometries> {
  let cached = geometryCache.get(species);
  if (!cached) {
    cached = buildParts(species);
    geometryCache.set(species, cached);
  }
  return cached;
}

function getAccessoryGeometry(id: CharacterAccessory): Promise<BufferGeometry | null> {
  let cached = accessoryCache.get(id);
  if (!cached) {
    cached = buildAccessoryGeometry(id);
    accessoryCache.set(id, cached);
  }
  return cached;
}

export interface MochiAvatarOptions {
  ghost?: boolean;
}

/**
 * Membangun Group THREE untuk satu karakter Mochi (preview pemilih,
 * penanda hologram, dsb.). Geometri di-cache per spesies.
 */
export async function buildMochiAvatar(
  custom: MochiCustomization,
  options: MochiAvatarOptions = {},
): Promise<Group> {
  const THREE = await import("three");
  const parts = await getMochiParts(custom.species);
  const accessoryGeom = custom.accessory
    ? await getAccessoryGeometry(custom.accessory)
    : null;

  const group = new THREE.Group();
  const bodyColor = new THREE.Color(mochiBodyColor(custom));
  const accentColor = new THREE.Color(mochiAccentColor(custom));
  if (options.ghost) {
    bodyColor.multiplyScalar(0.55);
    accentColor.multiplyScalar(0.55);
  }

  const colors: Record<MochiPartName, Color> = {
    body: bodyColor,
    accent: accentColor,
    detail: accentColor.clone().multiplyScalar(0.8),
    face: new THREE.Color(0x22262e),
    accessory: custom.accessory === "halo" ? accentColor.clone() : new THREE.Color(0xe8ecf1),
  };

  const geometries: MochiPartGeometries = {
    ...parts,
    accessory: accessoryGeom,
  };

  for (const name of Object.keys(geometries) as MochiPartName[]) {
    const geom = geometries[name];
    if (!geom) continue;
    const mat = new THREE.MeshStandardMaterial({
      color: colors[name],
      roughness: name === "accessory" && custom.accessory === "space_helmet" ? 0.15 : 0.6,
      metalness: name === "accessory" ? 0.4 : 0.05,
      transparent: custom.accessory === "space_helmet",
      opacity: custom.accessory === "space_helmet" ? 0.45 : 1,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = false;
    group.add(mesh);
  }

  return group;
}
