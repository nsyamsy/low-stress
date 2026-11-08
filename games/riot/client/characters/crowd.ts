import type {
  CharacterAccessory,
  HumanoidBodyVariant,
  MochiCustomization,
  MochiSpecies,
  RiotCharacterCustomization,
} from "../../shared/character";
import type {
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Scene,
} from "three";
import {
  HUMANOID_PALETTES,
  mochiAccentColor,
  mochiBodyColor,
} from "../../shared/character";
import {
  buildAccessoryGeometry,
  getMochiParts,
  type MochiPartName,
  type MochiPartGeometries,
} from "./mochi";
import { loadVariant } from "./humanoid";

export interface CrowdCharacterState {
  id: string;
  custom: RiotCharacterCustomization;
  x: number;
  y: number;
  heading: number;
  ghost?: boolean;
}

const loadThree = () => import("three");
type Three = Awaited<ReturnType<typeof loadThree>>;

interface SpeciesBucket {
  slots: Map<string, number>;
  nextSlot: number;
  parts: Map<MochiPartName, InstancedMesh>;
}

interface AccessoryBucket {
  slots: Map<string, number>;
  nextSlot: number;
  mesh: InstancedMesh | null;
}

interface HumanoidBucket {
  variant: HumanoidBodyVariant;
  slots: Map<string, number>;
  nextSlot: number;
  /** Satu InstancedMesh per mesh sumber pada GLB (biasanya 2). */
  parts: InstancedMesh[];
}

const BODY_PARTS: readonly MochiPartName[] = ["body", "accent", "detail", "face"];

function shade(hex: number, factor: number): number {
  const r = Math.min(255, Math.round(((hex >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((hex >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((hex & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

function partColor(part: MochiPartName, custom: MochiCustomization, ghost: boolean): number {
  const body = mochiBodyColor(custom);
  const accent = mochiAccentColor(custom);
  let hex: number;
  switch (part) {
    case "body":
      hex = body;
      break;
    case "accent":
      hex = accent;
      break;
    case "detail":
      hex = shade(accent, 0.75);
      break;
    case "face":
      hex = 0x22262e;
      break;
    default:
      hex = 0xffffff;
  }
  return ghost ? shade(hex, 0.55) : hex;
}

/**
 * Mengelola InstancedMesh untuk kerumunan karakter (RT-40).
 *
 * - Bucket spesies: satu InstancedMesh per bagian (body/accent/detail/face)
 *   per spesies Mochi.
 * - Bucket aksesori: satu InstancedMesh per id aksesori (geometri aksesori
 *   tidak bergantung spesies).
 *
 * Warna diatur per-instance lewat `instanceColor`; slot yang kosong diisi
 * matriks skala-nol agar tidak tampak. Jumlah draw call tetap kecil
 * (<= ~6 spesies x 4 bagian + <= 8 aksesori) sehingga anggaran R5 terjaga.
 */
export class MochiCrowd {
  private scene: Scene;
  private capacity: number;
  private speciesBuckets = new Map<MochiSpecies, SpeciesBucket>();
  private accessoryBuckets = new Map<CharacterAccessory, AccessoryBucket>();
  private humanoidBuckets = new Map<HumanoidBodyVariant, HumanoidBucket>();
  private speciesReady = new Map<MochiSpecies, Promise<SpeciesBucket>>();
  private accessoryReady = new Map<CharacterAccessory, Promise<AccessoryBucket>>();
  private humanoidReady = new Map<HumanoidBodyVariant, Promise<HumanoidBucket>>();
  private characters = new Map<string, CrowdCharacterState>();
  /** Posisi frame-sekarang (interpolasi/prediksi) yang menimpa state dasar. */
  private framePositions = new Map<string, { x: number; y: number; heading: number }>();
  private disposed = false;
  private three: Three | null = null;
  private dummy: Object3D | null = null;
  private zeroMatrix: Matrix4 | null = null;
  /** RT-52: bila true, goyangan idle (bob) dimatikan. */
  reducedMotion = false;

  constructor(scene: Scene, capacity = 32) {
    this.scene = scene;
    this.capacity = capacity;
  }

  private async ensureSpeciesBucket(species: MochiSpecies): Promise<SpeciesBucket> {
    const existing = this.speciesBuckets.get(species);
    if (existing) return existing;
    const pending = this.speciesReady.get(species);
    if (pending) return pending;

    const promise = (async () => {
      const THREE = await loadThree();
      this.three = THREE;
      const parts: MochiPartGeometries = await getMochiParts(species);
      const bucket: SpeciesBucket = { slots: new Map(), nextSlot: 0, parts: new Map() };

      for (const partName of BODY_PARTS) {
        const geom = parts[partName];
        if (!geom) continue;
        const material = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: partName === "face" ? 0.4 : 0.6,
          metalness: 0.05,
        });
        const mesh = new THREE.InstancedMesh(geom, material, this.capacity);
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(mesh);
        bucket.parts.set(partName, mesh);
      }

      this.speciesBuckets.set(species, bucket);
      return bucket;
    })();

    this.speciesReady.set(species, promise);
    return promise;
  }

  private async ensureAccessoryBucket(
    accessory: CharacterAccessory,
  ): Promise<AccessoryBucket> {
    const existing = this.accessoryBuckets.get(accessory);
    if (existing) return existing;
    const pending = this.accessoryReady.get(accessory);
    if (pending) return pending;

    const promise = (async () => {
      const THREE = await loadThree();
      this.three = THREE;
      const geom = await buildAccessoryGeometry(accessory);
      if (!geom || this.disposed) {
        return { slots: new Map(), nextSlot: 0, mesh: null };
      }
      const isHalo = accessory === "halo";
      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: isHalo ? 0.3 : accessory === "space_helmet" ? 0.15 : 0.5,
        metalness: isHalo ? 0.1 : 0.35,
        transparent: accessory === "space_helmet",
        opacity: accessory === "space_helmet" ? 0.4 : 1,
      });
      const mesh = new THREE.InstancedMesh(geom, material, this.capacity);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(mesh);
      const bucket: AccessoryBucket = { slots: new Map(), nextSlot: 0, mesh };
      this.accessoryBuckets.set(accessory, bucket);
      return bucket;
    })();

    this.accessoryReady.set(accessory, promise);
    return promise;
  }

  /**
   * Bucket Humanoid: muat GLB varian sekali, lalu buat InstancedMesh untuk
   * setiap mesh sumber. Material digandakan per varian dan diberi instanceColor
   * untuk palet tint.
   */
  private async ensureHumanoidBucket(
    variant: HumanoidBodyVariant,
  ): Promise<HumanoidBucket> {
    const existing = this.humanoidBuckets.get(variant);
    if (existing) return existing;
    const pending = this.humanoidReady.get(variant);
    if (pending) return pending;

    const promise = (async () => {
      const THREE = await loadThree();
      this.three = THREE;
      const { scene } = await loadVariant(variant);
      const bucket: HumanoidBucket = { variant, slots: new Map(), nextSlot: 0, parts: [] };

      scene.updateMatrixWorld(true);
      scene.traverse((obj) => {
        const mesh = obj as Mesh;
        if (!mesh.isMesh) return;
        const srcMat = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
        const material = (srcMat as Material).clone() as MeshStandardMaterial;
        if ("color" in material) material.color.setHex(0xffffff);
        material.metalness = 0;
        material.roughness = 0.8;

        const im = new THREE.InstancedMesh(mesh.geometry, material, this.capacity);
        im.count = 0;
        im.frustumCulled = false;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        // Bawa rotasi/scale lokal node sumber (mis. offset anggota tubuh).
        const nodeMatrix = new THREE.Matrix4().copy(mesh.matrixWorld);
        im.userData.nodeMatrix = nodeMatrix;
        this.scene.add(im);
        bucket.parts.push(im);
      });

      this.humanoidBuckets.set(variant, bucket);
      return bucket;
    })();

    this.humanoidReady.set(variant, promise);
    return promise;
  }

  /**
   * Menyisipkan atau memperbarui karakter. Dipanggil saat lobby/daftar pemain
   * berubah dan saat kustomisasi diganti.
   */
  async upsert(state: CrowdCharacterState): Promise<void> {
    if (this.disposed) return;
    const prev = this.characters.get(state.id);
    if (prev) this.release(prev);
    this.characters.set(state.id, state);

    const THREE = await loadThree();
    const color = new THREE.Color();

    if (state.custom.type === "mochi") {
      const bucket = await this.ensureSpeciesBucket(state.custom.species);
      if (this.disposed) return;

      let slot = bucket.slots.get(state.id);
      if (slot === undefined) {
        slot = bucket.nextSlot++;
        bucket.slots.set(state.id, slot);
      }

      for (const [partName, mesh] of bucket.parts) {
        color.setHex(partColor(partName, state.custom, Boolean(state.ghost)));
        mesh.setColorAt(slot, color);
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }

      for (const mesh of bucket.parts.values()) {
        mesh.count = bucket.nextSlot;
      }
    } else {
      const bucket = await this.ensureHumanoidBucket(state.custom.bodyVariant);
      if (this.disposed) return;

      let slot = bucket.slots.get(state.id);
      if (slot === undefined) {
        slot = bucket.nextSlot++;
        bucket.slots.set(state.id, slot);
      }

      const palette =
        HUMANOID_PALETTES[state.custom.paletteIndex % HUMANOID_PALETTES.length] ?? 0xffffff;
      color.setHex(state.ghost ? shade(palette, 0.55) : palette);
      for (const mesh of bucket.parts) {
        mesh.setColorAt(slot, color);
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.count = bucket.nextSlot;
      }
    }

    const accessory = state.custom.accessory;
    if (accessory) {
      const accBucket = await this.ensureAccessoryBucket(accessory);
      if (this.disposed || !accBucket.mesh) return;
      let accSlot = accBucket.slots.get(state.id);
      if (accSlot === undefined) {
        accSlot = accBucket.nextSlot++;
        accBucket.slots.set(state.id, accSlot);
      }
      color.setHex(
        accessory === "halo"
          ? state.custom.type === "mochi"
            ? shade(mochiAccentColor(state.custom), state.ghost ? 0.55 : 1)
            : state.ghost
              ? shade(0xe8ecf1, 0.55)
              : 0xe8ecf1
          : state.ghost
            ? shade(0xe8ecf1, 0.55)
            : 0xe8ecf1,
      );
      accBucket.mesh.setColorAt(accSlot, color);
      if (accBucket.mesh.instanceColor) accBucket.mesh.instanceColor.needsUpdate = true;
      accBucket.mesh.count = accBucket.nextSlot;
    }
  }

  remove(id: string): void {
    const state = this.characters.get(id);
    if (!state) return;
    this.characters.delete(id);
    this.release(state);
  }

  clear(): void {
    for (const state of [...this.characters.values()]) this.release(state);
    this.characters.clear();
  }

  /**
   * Menetapkan posisi render per frame (mis. hasil interpolasi remote atau
   * prediksi lokal). Dipanggil tiap frame sebelum `update`.
   */
  setFramePositions(
    positions: ReadonlyMap<string, { x: number; y: number; heading: number }>,
  ): void {
    this.framePositions = positions as Map<string, { x: number; y: number; heading: number }>;
  }

  /**
   * Dipanggil tiap frame untuk menulis ulang matriks semua instance
   * (posisi, rotasi hadap, dan sedikit goyangan idle).
   */
  update(now = performance.now()): void {
    if (this.disposed || !this.three) return;
    const THREE = this.three;
    if (!this.dummy) this.dummy = new THREE.Object3D();
    if (!this.zeroMatrix) {
      this.zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    }
    const dummy = this.dummy;

    for (const state of this.characters.values()) {
      const fp = this.framePositions.get(state.id);
      const px = fp?.x ?? state.x;
      const py = fp?.y ?? state.y;
      const heading = fp?.heading ?? state.heading;
      const bob =
        state.ghost || this.reducedMotion
          ? 0
          : Math.sin(now * 0.004 + px) * 0.05;
      dummy.position.set(px, bob, -py);
      dummy.rotation.set(0, -heading + Math.PI / 2, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();

      if (state.custom.type === "mochi") {
        const bucket = this.speciesBuckets.get(state.custom.species);
        if (!bucket) continue;
        const slot = bucket.slots.get(state.id);
        if (slot === undefined) continue;

        for (const mesh of bucket.parts.values()) {
          mesh.setMatrixAt(slot, dummy.matrix);
          mesh.instanceMatrix.needsUpdate = true;
        }
      } else {
        const bucket = this.humanoidBuckets.get(state.custom.bodyVariant);
        if (!bucket) continue;
        const slot = bucket.slots.get(state.id);
        if (slot === undefined) continue;

        const nodeMatrix = new THREE.Matrix4();
        const combined = new THREE.Matrix4();
        for (const mesh of bucket.parts) {
          nodeMatrix.copy(mesh.userData.nodeMatrix as Matrix4);
          combined.multiplyMatrices(dummy.matrix, nodeMatrix);
          mesh.setMatrixAt(slot, combined);
          mesh.instanceMatrix.needsUpdate = true;
        }
      }

      const accessory = state.custom.accessory;
      if (accessory) {
        const accBucket = this.accessoryBuckets.get(accessory);
        const accSlot = accBucket?.slots.get(state.id);
        if (accBucket?.mesh && accSlot !== undefined) {
          accBucket.mesh.setMatrixAt(accSlot, dummy.matrix);
          accBucket.mesh.instanceMatrix.needsUpdate = true;
        }
      }
    }
  }

  private release(state: CrowdCharacterState): void {
    const THREE = this.three;
    if (!THREE) return;
    if (!this.zeroMatrix) this.zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

    if (state.custom.type === "mochi") {
      const bucket = this.speciesBuckets.get(state.custom.species);
      if (bucket) {
        const slot = bucket.slots.get(state.id);
        if (slot !== undefined) {
          bucket.slots.delete(state.id);
          for (const mesh of bucket.parts.values()) {
            mesh.setMatrixAt(slot, this.zeroMatrix);
            mesh.instanceMatrix.needsUpdate = true;
          }
        }
      }
    } else {
      const bucket = this.humanoidBuckets.get(state.custom.bodyVariant);
      if (bucket) {
        const slot = bucket.slots.get(state.id);
        if (slot !== undefined) {
          bucket.slots.delete(state.id);
          for (const mesh of bucket.parts) {
            mesh.setMatrixAt(slot, this.zeroMatrix);
            mesh.instanceMatrix.needsUpdate = true;
          }
        }
      }
    }

    if (state.custom.accessory) {
      const accBucket = this.accessoryBuckets.get(state.custom.accessory);
      if (accBucket?.mesh) {
        const accSlot = accBucket.slots.get(state.id);
        if (accSlot !== undefined) {
          accBucket.slots.delete(state.id);
          if (!this.zeroMatrix) this.zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
          accBucket.mesh.setMatrixAt(accSlot, this.zeroMatrix);
          accBucket.mesh.instanceMatrix.needsUpdate = true;
        }
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const bucket of this.speciesBuckets.values()) {
      for (const mesh of bucket.parts.values()) {
        this.scene.remove(mesh);
        mesh.dispose();
      }
    }
    for (const bucket of this.accessoryBuckets.values()) {
      if (bucket.mesh) {
        this.scene.remove(bucket.mesh);
        bucket.mesh.dispose();
      }
    }
    for (const bucket of this.humanoidBuckets.values()) {
      for (const mesh of bucket.parts) {
        this.scene.remove(mesh);
        mesh.dispose();
      }
    }
    this.speciesBuckets.clear();
    this.accessoryBuckets.clear();
    this.humanoidBuckets.clear();
    this.speciesReady.clear();
    this.accessoryReady.clear();
    this.humanoidReady.clear();
    this.characters.clear();
  }
}
