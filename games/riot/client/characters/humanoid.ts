/// <reference types="vite/client" />
import type { Group, Material, Mesh, MeshStandardMaterial } from "three";
import {
  HUMANOID_PALETTES,
  type HumanoidCustomization,
  type HumanoidBodyVariant,
} from "../../shared/character";

/**
 * Pemuat tipe tubuh Humanoid (RT-41).
 *
 * Model berasal dari paket CC0 "Mini Characters" oleh Kenney
 * (lisensi di `assets/LICENSES.md`). GLB di-bundle lewat `import.meta.glob`
 * sehingga tidak ada permintaan eksternal; tekstur `colormap.png` dipetakan
 * ulang lewat `LoadingManager.setURLModifier` karena GLB menyimpan URI
 * relatif `Textures/colormap.png`.
 */

const glbUrls = import.meta.glob("../../assets/models/humanoid/character-*.glb", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;

const colormapUrls = import.meta.glob(
  "../../assets/models/humanoid/Textures/colormap.png",
  { query: "?url", import: "default", eager: true },
) as Record<string, string>;

const COLOMAP_URL = Object.values(colormapUrls)[0];

/** Tinggi target karakter humanoid dalam meter (menyamai Mochi). */
const TARGET_HEIGHT = 1.7;

export interface LoadedHumanoid {
  scene: Group;
  materials: Material[];
}

const cache = new Map<HumanoidBodyVariant, Promise<LoadedHumanoid>>();

function humanoidUrl(variant: HumanoidBodyVariant): string | undefined {
  const suffix = `/character-${variant.replace("character-", "")}.glb`;
  for (const [path, url] of Object.entries(glbUrls)) {
    if (path.endsWith(suffix)) return url;
  }
  return undefined;
}

export async function loadVariant(variant: HumanoidBodyVariant): Promise<LoadedHumanoid> {
  const THREE = await import("three");
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");

  const url = humanoidUrl(variant);
  if (!url) throw new Error(`Aset humanoid tidak ditemukan: ${variant}`);

  const manager = new THREE.LoadingManager();
  if (COLOMAP_URL) {
    manager.setURLModifier((assetUrl) =>
      assetUrl.includes("colormap") ? COLOMAP_URL : assetUrl,
    );
  }
  const loader = new GLTFLoader(manager);

  const gltf = await loader.loadAsync(url);
  const scene = gltf.scene;

  // Normalkan tinggi ke TARGET_HEIGHT agar sepadan dengan Mochi.
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  if (size.y > 0.001) {
    const scale = TARGET_HEIGHT / size.y;
    scene.scale.setScalar(scale);
  }
  // Pusatkan kaki di y=0.
  const boxAfter = new THREE.Box3().setFromObject(scene);
  scene.position.y = -boxAfter.min.y;

  const materials = new Set<Material>();
  scene.traverse((obj) => {
    const mesh = obj as Mesh;
    if (mesh.isMesh) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) materials.add(m);
    }
  });

  return { scene, materials: [...materials] };
}

/**
 * Membangun Group THREE untuk satu karakter Humanoid dengan palet tint.
 * Aksesori (bila ada) dirender terpisah oleh pemanggil memakai geometri
 * prosedural yang sama dengan Mochi.
 */
export async function buildHumanoidAvatar(
  custom: HumanoidCustomization,
): Promise<Group> {
  const THREE = await import("three");
  let entry = cache.get(custom.bodyVariant);
  if (!entry) {
    entry = loadVariant(custom.bodyVariant);
    cache.set(custom.bodyVariant, entry);
  }
  const { scene, materials } = await entry;

  const group = new THREE.Group();
  const avatar = scene.clone(true);
  group.add(avatar);

  const tint = new THREE.Color(HUMANOID_PALETTES[custom.paletteIndex % HUMANOID_PALETTES.length] ?? 0xffffff);
  avatar.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const src of mats) {
      const cloned = src.clone() as MeshStandardMaterial;
      if ("color" in cloned) cloned.color.multiply(tint);
      mesh.material = Array.isArray(mesh.material)
        ? mats.map((m) => (m === src ? cloned : m))
        : cloned;
    }
  });
  void materials;
  return group;
}
