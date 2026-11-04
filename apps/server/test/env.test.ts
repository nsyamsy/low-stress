import { describe, expect, it } from "vitest";

import { EnvError, readEnv, smtpConfigured } from "../src/env";

const base = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/low_stress",
  SESSION_SECRET: "01234567890123456789012345678901",
};

describe("readEnv", () => {
  it("applies defaults", () => {
    const env = readEnv(base);
    expect(env.NODE_ENV).toBe("development");
    expect(env.DEPLOY_MODE).toBe("lan");
    expect(env.PORT).toBe(3001);
    expect(env.TZ_APP).toBe("Asia/Jakarta");
    expect(env.COOKIE_SECURE).toBe("auto");
    expect(env.DEFAULT_LOCALE).toBe("auto");
  });

  it("coerces PORT and validates ranges", () => {
    expect(readEnv({ ...base, PORT: "8080" }).PORT).toBe(8080);
    expect(() => readEnv({ ...base, PORT: "0" })).toThrow(EnvError);
    expect(() => readEnv({ ...base, PORT: "abc" })).toThrow(EnvError);
  });

  it("rejects a short session secret", () => {
    expect(() => readEnv({ ...base, SESSION_SECRET: "short" })).toThrow(EnvError);
  });

  it("requires DATABASE_URL", () => {
    const withoutDb: Record<string, string> = { ...base };
    delete withoutDb.DATABASE_URL;
    expect(() => readEnv(withoutDb)).toThrow(EnvError);
  });

  it("reports SMTP as configured only when host and from exist", () => {
    expect(smtpConfigured(readEnv(base))).toBe(false);
    expect(
      smtpConfigured(
        readEnv({ ...base, SMTP_HOST: "smtp.local", SMTP_FROM: "noreply@local" }),
      ),
    ).toBe(true);
  });
});
