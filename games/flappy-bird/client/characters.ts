/* eslint-disable low-stress/no-raw-design-values */
// The characters the player can fly in Flappy Bird. Each is drawn on the canvas around (0, 0), facing
// right, and stays inside the bird's old outline (about 17 by 13, beak to x = 24) so the collision
// box and with it the difficulty is the same for every character.

export const CHARACTERS = ["yellow", "red", "blue", "bat", "plane", "ghost"] as const;
export type CharacterId = (typeof CHARACTERS)[number];
export const isCharacter = (v: unknown): v is CharacterId =>
  typeof v === "string" && (CHARACTERS as readonly string[]).includes(v);

interface Palette {
  body: string;
  wing: string;
  line: string;
  beak: string;
}

const PALETTES: Record<"yellow" | "red" | "blue", Palette> = {
  yellow: { body: "#f8d12f", wing: "#f0a81c", line: "#8a5a12", beak: "#f4733a" },
  red: { body: "#e8483a", wing: "#b82c22", line: "#6e1712", beak: "#f8c12f" },
  blue: { body: "#4aa3e8", wing: "#2b6fb8", line: "#173f6b", beak: "#f4a23a" },
};

type Ctx = CanvasRenderingContext2D;

function bird(ctx: Ctx, flap: number, p: Palette): void {
  ctx.fillStyle = p.body;
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 17, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.translate(-5, 3);
  ctx.rotate(flap);
  ctx.fillStyle = p.wing;
  ctx.beginPath();
  ctx.ellipse(0, 0, 9, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(8, -5, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.arc(10, -5, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.beak;
  ctx.beginPath();
  ctx.moveTo(13, 1);
  ctx.lineTo(24, 4);
  ctx.lineTo(13, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function bat(ctx: Ctx, flap: number): void {
  ctx.strokeStyle = "#241338";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  // wing, hinged at the shoulder
  ctx.save();
  ctx.translate(-3, -3);
  ctx.rotate(-0.5 + flap * 0.9);
  ctx.fillStyle = "#6b45a0";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-3, -20);
  ctx.lineTo(-9, -11);
  ctx.lineTo(-15, -17);
  ctx.lineTo(-19, -2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "#3b2457";
  ctx.beginPath();
  ctx.ellipse(0, 0, 15, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // ears
  ctx.beginPath();
  ctx.moveTo(4, -10);
  ctx.lineTo(6, -18);
  ctx.lineTo(10, -9);
  ctx.moveTo(10, -9);
  ctx.lineTo(15, -15);
  ctx.lineTo(14, -5);
  ctx.fill();
  ctx.stroke();
  // eyes and fangs
  ctx.fillStyle = "#ff5a5a";
  ctx.beginPath();
  ctx.arc(8, -3, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(9, 5);
  ctx.lineTo(11, 11);
  ctx.lineTo(13, 4);
  ctx.closePath();
  ctx.fill();
}

function plane(ctx: Ctx, flap: number): void {
  ctx.rotate(flap * 0.08);
  ctx.strokeStyle = "#4d5f72";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.fillStyle = "#c9d6e3";
  ctx.beginPath();
  ctx.moveTo(23, 1);
  ctx.lineTo(-6, 1);
  ctx.lineTo(-15, 11);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(23, 1);
  ctx.lineTo(-15, -12);
  ctx.lineTo(-6, 1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(23, 1);
  ctx.lineTo(-6, 1);
  ctx.stroke();
}

function ghost(ctx: Ctx, flap: number): void {
  ctx.strokeStyle = "#7d8aa0";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.fillStyle = "#f7f9fc";
  ctx.beginPath();
  ctx.arc(0, -1, 16, Math.PI, 0);
  ctx.lineTo(16, 12);
  ctx.quadraticCurveTo(12, 6, 8, 12);
  ctx.quadraticCurveTo(4, 6, 0, 12);
  ctx.quadraticCurveTo(-4, 6, -8, 12);
  ctx.quadraticCurveTo(-12, 6, -16, 12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // little arm that waves with the flap
  ctx.save();
  ctx.translate(-14, 3);
  ctx.rotate(flap * 0.8);
  ctx.beginPath();
  ctx.ellipse(-3, 0, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "#26303d";
  ctx.beginPath();
  ctx.ellipse(-2, -5, 2.4, 3.4, 0, 0, Math.PI * 2);
  ctx.ellipse(8, -5, 2.4, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(3, 3, 2.6, 3, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Draws a character at the origin; `flap` is the wing angle in radians (about -0.6 to 0.6). */
export function drawCharacter(ctx: Ctx, id: CharacterId, flap: number): void {
  switch (id) {
    case "bat":
      return bat(ctx, flap);
    case "plane":
      return plane(ctx, flap);
    case "ghost":
      return ghost(ctx, flap);
    default:
      return bird(ctx, flap, PALETTES[id]);
  }
}
