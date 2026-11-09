export type UpdateSwFn = (reloadPage?: boolean) => Promise<void>;

export interface SwStatusState {
  needRefresh: boolean;
  offlineReady: boolean;
}

let state: SwStatusState = {
  needRefresh: false,
  offlineReady: false,
};

let currentUpdateFn: UpdateSwFn | null = null;
const listeners = new Set<(next: SwStatusState) => void>();

function emit() {
  for (const listener of listeners) {
    listener({ ...state });
  }
}

export function getSwState(): SwStatusState {
  return { ...state };
}

export function subscribeSwState(
  listener: (next: SwStatusState) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifySwNeedRefresh(updateFn: UpdateSwFn): void {
  currentUpdateFn = updateFn;
  state = { ...state, needRefresh: true };
  emit();
}

export function notifySwOfflineReady(): void {
  state = { ...state, offlineReady: true };
  emit();
}

export async function applySwUpdate(): Promise<void> {
  const fn = currentUpdateFn;
  state = { ...state, needRefresh: false };
  emit();
  if (fn) {
    await fn(true);
  }
}

export function dismissSwUpdate(): void {
  state = { ...state, needRefresh: false };
  emit();
}

export function resetSwStateForTest(): void {
  state = { needRefresh: false, offlineReady: false };
  currentUpdateFn = null;
  emit();
}
