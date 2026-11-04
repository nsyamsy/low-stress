import { describe, expect, it } from "vitest";
import {
  CONFIG,
  GROUND_H,
  H,
  PLAY_H,
  W,
  createState,
  flap,
  hitsPipe,
  medalFor,
  pipeSpeed,
  step,
  type Pipe,
} from "../shared/engine";

describe("P6-01: Flappy Bird Engine & Physics", () => {
  it("memiliki konstanta yang identik dengan aslinya", () => {
    expect(W).toBe(360);
    expect(H).toBe(560);
    expect(GROUND_H).toBe(70);
    expect(PLAY_H).toBe(490);

    expect(CONFIG.gravity).toBe(1500);
    expect(CONFIG.flapVelocity).toBe(-430);
    expect(CONFIG.maxFall).toBe(640);
    expect(CONFIG.baseSpeed).toBe(150);
    expect(CONFIG.speedPerPoint).toBe(2);
    expect(CONFIG.maxSpeedBonus).toBe(80);
    expect(CONFIG.gap).toBe(150);
    expect(CONFIG.pipeWidth).toBe(58);
    expect(CONFIG.spacing).toBe(210);
    expect(CONFIG.birdX).toBe(90);
    expect(CONFIG.birdRadius).toBe(12);
    expect(CONFIG.startY).toBe(270);
    expect(CONFIG.gapMargin).toBe(46);
  });

  it("membuat state awal (ready phase) yang valid", () => {
    const s = createState();
    expect(s.phase).toBe("ready");
    expect(s.birdY).toBe(CONFIG.startY);
    expect(s.birdVy).toBe(0);
    expect(s.birdRot).toBe(0);
    expect(s.pipes).toEqual([]);
    expect(s.score).toBe(0);
    expect(s.groundX).toBe(0);
    expect(s.time).toBe(0);
    expect(s.sinceOver).toBe(0);
    expect(s.hitGround).toBe(false);
  });

  it("menggerakkan burung mengambang perlahan pada fase ready", () => {
    const s = createState();
    step(s, 0.1);
    expect(s.phase).toBe("ready");
    expect(s.time).toBeCloseTo(0.1);
    expect(s.birdY).toBe(CONFIG.startY + Math.sin(0.1 * 5) * 8);
    expect(s.groundX).toBe((CONFIG.baseSpeed * 0.1) % 24);
  });

  it("memulai permainan dan mengatur kecepatan lompat saat flap", () => {
    const s = createState();
    flap(s);
    expect(s.phase).toBe("playing");
    expect(s.birdVy).toBe(CONFIG.flapVelocity);

    // Flap lagi saat bermain
    s.birdVy = 200;
    flap(s);
    expect(s.birdVy).toBe(CONFIG.flapVelocity);

    // Flap saat game over diabaikan
    s.phase = "over";
    s.birdVy = 0;
    flap(s);
    expect(s.birdVy).toBe(0);
  });

  it("mensimulasikan fisika gravitasi dan kecepatan terminal", () => {
    const s = createState();
    flap(s); // phase: playing, birdVy = -430

    const dt = 1 / 120;
    step(s, dt);

    // Setelah dt, birdVy bertambah oleh gravitasi
    expect(s.birdVy).toBeCloseTo(CONFIG.flapVelocity + CONFIG.gravity * dt);

    // Burung jatuh bebas lama -> birdVy mencapai maxFall
    for (let i = 0; i < 200; i++) {
      step(s, dt);
      if (s.phase === "over") break;
    }
    // Jika tidak menabrak pipa atau tanah, vy dibatasi ke maxFall
    const sFree = createState();
    sFree.phase = "playing";
    sFree.birdY = 100;
    sFree.birdVy = 1000; // melebihi terminal
    step(sFree, dt);
    expect(sFree.birdVy).toBe(CONFIG.maxFall);
  });

  it("menghentikan burung di langit-langit tanpa mematikan game", () => {
    const s = createState();
    s.phase = "playing";
    s.birdY = 5;
    s.birdVy = -500;

    step(s, 0.05);
    expect(s.birdY).toBe(CONFIG.birdRadius);
    expect(s.birdVy).toBeGreaterThanOrEqual(0);
    expect(s.phase).toBe("playing");
  });

  it("mengakhiri permainan saat burung menabrak tanah", () => {
    const s = createState();
    s.phase = "playing";
    s.birdY = PLAY_H - CONFIG.birdRadius; // tepat di tanah
    s.birdVy = 100;

    step(s, 0.05);
    expect(s.phase).toBe("over");
    expect(s.hitGround).toBe(true);
    expect(s.birdY).toBe(PLAY_H - CONFIG.birdRadius);
  });

  it("menghitung kecepatan pipa berdasarkan skor (speedPerPoint & maxSpeedBonus)", () => {
    expect(pipeSpeed(0)).toBe(150);
    expect(pipeSpeed(10)).toBe(150 + 20); // 170
    expect(pipeSpeed(40)).toBe(150 + 80); // 230 (max)
    expect(pipeSpeed(100)).toBe(150 + 80); // tetap 230
  });

  it("menghasilkan pipa baru dan menggerakkannya ke kiri", () => {
    const s = createState();
    s.phase = "playing";

    // Pipa pertama di-spawn
    step(s, 1 / 60, () => 0.5);
    expect(s.pipes.length).toBe(1);
    const firstPipe = s.pipes[0]!;
    expect(firstPipe.x).toBe(W + 60);
    expect(firstPipe.passed).toBe(false);

    // Langkah berikutnya menggerakkannya ke kiri
    step(s, 1 / 60, () => 0.5);
    expect(firstPipe.x).toBeCloseTo(W + 60 - pipeSpeed(0) * (1 / 60));
  });

  it("mendeteksi burung melewati pipa dan menambah skor", () => {
    const s = createState();
    s.phase = "playing";
    s.birdY = 250; // aman di tengah gap

    // Buat pipa tepat di belakang burung
    const pipe: Pipe = {
      x: CONFIG.birdX - CONFIG.birdRadius - CONFIG.pipeWidth + 1,
      gapY: 250,
      passed: false,
    };
    s.pipes = [pipe];

    step(s, 0.05); // pipa maju ke kiri melewati batas burung
    expect(pipe.passed).toBe(true);
    expect(s.score).toBe(1);
  });

  it("mendeteksi tabrakan burung dengan pipa (hitsPipe)", () => {
    const s = createState();
    s.birdY = 200;

    // Pipa jauh di x = 300 -> tidak tabrakan
    const distantPipe: Pipe = { x: 300, gapY: 200, passed: false };
    expect(hitsPipe(s, distantPipe)).toBe(false);

    // Pipa berada di x burung, burung tepat di tengah gap -> aman
    const safePipe: Pipe = { x: CONFIG.birdX - 10, gapY: 200, passed: false };
    expect(hitsPipe(s, safePipe)).toBe(false);

    // Pipa berada di x burung, burung menabrak pipa atas
    const hitTopPipe: Pipe = { x: CONFIG.birdX - 10, gapY: 300, passed: false };
    // gapTop = 300 - 75 = 225. birdY = 200 < gapTop - birdRadius -> tabrak
    expect(hitsPipe(s, hitTopPipe)).toBe(true);

    // Pipa berada di x burung, burung menabrak pipa bawah
    const hitBottomPipe: Pipe = { x: CONFIG.birdX - 10, gapY: 100, passed: false };
    // gapBottom = 100 + 75 = 175. birdY = 200 > gapBottom + birdRadius -> tabrak
    expect(hitsPipe(s, hitBottomPipe)).toBe(true);
  });

  it("menghitung medali dengan benar sesuai kriteria", () => {
    expect(medalFor(0)).toBeNull();
    expect(medalFor(9)).toBeNull();
    expect(medalFor(10)).toBe("bronze");
    expect(medalFor(19)).toBe("bronze");
    expect(medalFor(20)).toBe("silver");
    expect(medalFor(29)).toBe("silver");
    expect(medalFor(30)).toBe("gold");
    expect(medalFor(100)).toBe("gold");
  });
});
