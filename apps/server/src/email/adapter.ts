import net from "node:net";
import type { Env } from "../env";
import { smtpConfigured } from "../env";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailAdapter {
  send(message: EmailMessage): Promise<void>;
}

export class LogAdapter implements EmailAdapter {
  constructor(private readonly logger?: { info: (...args: unknown[]) => void }) {}

  async send(message: EmailMessage): Promise<void> {
    if (this.logger) {
      this.logger.info({ to: message.to, subject: message.subject }, "[email:log] Email dikirim via LogAdapter");
    } else {
      console.log(`[email:log] Ke: ${message.to} | Subjek: ${message.subject}\n${message.text}`);
    }
  }
}

export class SmtpAdapter implements EmailAdapter {
  constructor(private readonly env: Env) {}

  async send(message: EmailMessage): Promise<void> {
    if (!smtpConfigured(this.env)) {
      throw new Error("SMTP belum dikonfigurasi");
    }

    const host = this.env.SMTP_HOST!;
    const port = this.env.SMTP_PORT ?? 587;
    const from = this.env.SMTP_FROM!;
    const user = this.env.SMTP_USER;
    const pass = this.env.SMTP_PASS;

    return new Promise<void>((resolve, reject) => {
      const socket = net.createConnection(port, host);
      socket.setEncoding("utf-8");
      socket.setTimeout(15000);

      let buffer = "";
      let step = 0;

      const sendCommand = (cmd: string) => {
        socket.write(cmd + "\r\n");
      };

      const onError = (err: Error) => {
        socket.destroy();
        reject(err);
      };

      socket.on("error", onError);
      socket.on("timeout", () => {
        onError(new Error("SMTP socket timeout"));
      });

      socket.on("data", (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split("\r\n");
        // Pertahankan baris terakhir yang mungkin belum utuh
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line) continue;
          const code = parseInt(line.substring(0, 3), 10);
          // Respons multi-baris memiliki tanda dash (-) setelah 3 digit angka (mis. 250-SIZE)
          if (line[3] === "-") continue;

          if (code >= 400) {
            onError(new Error(`SMTP error: ${line}`));
            return;
          }

          if (step === 0 && code === 220) {
            step = 1;
            sendCommand(`EHLO localhost`);
          } else if (step === 1 && code === 250) {
            if (user && pass) {
              step = 2;
              sendCommand("AUTH LOGIN");
            } else {
              step = 4;
              sendCommand(`MAIL FROM:<${from}>`);
            }
          } else if (step === 2 && code === 334) {
            step = 3;
            sendCommand(Buffer.from(user!).toString("base64"));
          } else if (step === 3 && code === 334) {
            step = 4;
            sendCommand(Buffer.from(pass!).toString("base64"));
          } else if (step === 4 && (code === 235 || code === 250)) {
            step = 5;
            sendCommand(`MAIL FROM:<${from}>`);
          } else if (step === 5 && code === 250) {
            step = 6;
            sendCommand(`RCPT TO:<${message.to}>`);
          } else if (step === 6 && code === 250) {
            step = 7;
            sendCommand("DATA");
          } else if (step === 7 && code === 354) {
            step = 8;
            const emailData = [
              `From: ${from}`,
              `To: ${message.to}`,
              `Subject: ${message.subject}`,
              "MIME-Version: 1.0",
              "Content-Type: text/plain; charset=UTF-8",
              "",
              message.text,
              ".",
            ].join("\r\n");
            sendCommand(emailData);
          } else if (step === 8 && code === 250) {
            step = 9;
            sendCommand("QUIT");
          } else if (step === 9 && code === 221) {
            socket.end();
            resolve();
          }
        }
      });
    });
  }
}

export function createEmailAdapter(
  env: Env,
  logger?: { info: (...args: unknown[]) => void },
): EmailAdapter {
  if (smtpConfigured(env)) {
    return new SmtpAdapter(env);
  }
  return new LogAdapter(logger);
}
