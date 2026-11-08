/**
 * Thumbnail kartu game. Setiap game membawa `games/<id>/thumbnail.svg` sendiri;
 * berkas ditemukan otomatis, jadi game baru tidak perlu mengubah kode inti.
 */
const modules = import.meta.glob<string>("../../../../../games/*/thumbnail.svg", {
  eager: true,
  query: "?url",
  import: "default",
});

const byGame = new Map<string, string>();
for (const [path, url] of Object.entries(modules)) {
  const match = /\/games\/([^/]+)\/thumbnail\.svg$/.exec(path);
  if (match?.[1]) byGame.set(match[1], url);
}

/** URL thumbnail game, atau null bila game belum menyediakannya. */
export function getGameThumbnail(gameId: string): string | null {
  return byGame.get(gameId) ?? null;
}
