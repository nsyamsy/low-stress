import { io as ioClient, type Socket } from "socket.io-client";

/**
 * Koneksi klien ke namespace `/riot`. Autentikasi murni lewat cookie sesi
 * (`withCredentials`); server menolak `handshake.auth` sebagai identitas.
 */
export function connectRiot(): Socket {
  return ioClient("/riot", {
    path: "/ws",
    withCredentials: true,
    transports: ["websocket", "polling"],
  });
}

/** Emit dengan acknowledgement Promise-based yang ringkas. */
export function emitAck<T = unknown>(
  socket: Socket,
  event: string,
  data?: unknown,
): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit(event, data ?? {}, (err: Error | null, res: T) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}
