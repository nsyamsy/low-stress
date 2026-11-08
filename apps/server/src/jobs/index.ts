import type { Database } from "@low-stress/db";
import type { GameJob, GameServerContext } from "@low-stress/sdk/server";
import { purgeOldChatMessages } from "../chat/service";
import { CHAT_PURGE_INTERVAL_MS } from "../chat/purge";
import { purgeExpiredSessions } from "../auth/session";
import { purgeStaleLoginAttempts } from "../auth/lockout";

export const SESSION_PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 jam
export const LOGIN_ATTEMPTS_PURGE_INTERVAL_MS = 60 * 60 * 1000; // 1 jam

export interface JobLogger {
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

export interface RegisteredJob {
  name: string;
  intervalMs: number;
  run: () => Promise<unknown> | unknown;
  stop?: () => void;
}

export interface CreateJobRunnerOptions {
  db?: Database;
  logger?: JobLogger;
  autoStart?: boolean;
}

export interface JobRunner {
  register: (job: RegisteredJob) => void;
  registerGameJobs: (jobs: readonly GameJob[], ctx: GameServerContext) => void;
  startAll: () => void;
  stopAll: () => void;
  runJob: (name: string) => Promise<unknown>;
  runAll: () => Promise<void>;
  listJobs: () => string[];
}

export function createCoreJobs(db: Database): RegisteredJob[] {
  return [
    {
      name: "purge-chat",
      intervalMs: CHAT_PURGE_INTERVAL_MS,
      run: () => purgeOldChatMessages(db),
    },
    {
      name: "purge-sessions",
      intervalMs: SESSION_PURGE_INTERVAL_MS,
      run: () => purgeExpiredSessions(db),
    },
    {
      name: "purge-login-attempts",
      intervalMs: LOGIN_ATTEMPTS_PURGE_INTERVAL_MS,
      run: () => purgeStaleLoginAttempts(db),
    },
  ];
}

export function createJobRunner(options: CreateJobRunnerOptions = {}): JobRunner {
  const { db, logger, autoStart = false } = options;
  const jobs = new Map<string, RegisteredJob>();
  const timers = new Map<string, ReturnType<typeof setInterval>>();
  let started = autoStart;

  async function executeSafe(job: RegisteredJob): Promise<unknown> {
    try {
      return await job.run();
    } catch (err: unknown) {
      logger?.error?.({ err, job: job.name }, `Job '${job.name}' gagal dijalankan`);
      return undefined;
    }
  }

  function scheduleJob(job: RegisteredJob): void {
    const existingTimer = timers.get(job.name);
    if (existingTimer) {
      clearInterval(existingTimer);
    }
    if (job.intervalMs <= 0) return;

    const timer = setInterval(() => {
      void executeSafe(job);
    }, job.intervalMs);

    if (typeof timer.unref === "function") {
      timer.unref();
    }
    timers.set(job.name, timer);
  }

  function register(job: RegisteredJob): void {
    const existingTimer = timers.get(job.name);
    if (existingTimer) {
      clearInterval(existingTimer);
      timers.delete(job.name);
    }
    jobs.set(job.name, job);
    if (started) {
      scheduleJob(job);
    }
  }

  function registerGameJobs(
    gameJobs: readonly GameJob[],
    ctx: GameServerContext,
  ): void {
    for (const gj of gameJobs) {
      register({
        name: gj.name,
        intervalMs: gj.intervalMs,
        run: () => gj.run(ctx),
        stop: gj.stop,
      });
    }
  }

  function startAll(): void {
    started = true;
    for (const job of jobs.values()) {
      if (!timers.has(job.name)) {
        scheduleJob(job);
      }
    }
  }

  function stopAll(): void {
    started = false;
    for (const timer of timers.values()) {
      clearInterval(timer);
    }
    timers.clear();

    for (const job of jobs.values()) {
      if (job.stop) {
        try {
          job.stop();
        } catch (err: unknown) {
          logger?.error?.({ err, job: job.name }, `Gagal menghentikan job '${job.name}'`);
        }
      }
    }
  }

  async function runJob(name: string): Promise<unknown> {
    const job = jobs.get(name);
    if (!job) {
      throw new Error(`Job '${name}' tidak terdaftar`);
    }
    return executeSafe(job);
  }

  async function runAll(): Promise<void> {
    for (const job of jobs.values()) {
      await executeSafe(job);
    }
  }

  function listJobs(): string[] {
    return Array.from(jobs.keys());
  }

  if (db) {
    for (const coreJob of createCoreJobs(db)) {
      register(coreJob);
    }
  }

  return {
    register,
    registerGameJobs,
    startAll,
    stopAll,
    runJob,
    runAll,
    listJobs,
  };
}
