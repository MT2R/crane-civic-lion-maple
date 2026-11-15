import { idbDrain } from "./idb";
import { previewPathPrefix } from "@/lib/preview-path-prefix";
import type { InboxEvent, SwEvent } from "./types";

export interface SwStatus {
  ok: boolean;
  trigger: boolean;
  count: number;
  tomorrow: number;
  permission: NotificationPermission | "unsupported";
  error?: string;
}

let regPromise: Promise<ServiceWorkerRegistration> | null = null;

function scriptUrl(): string {
  const prefix = previewPathPrefix(window.location.hostname, window.location.pathname) ?? "";
  return `${prefix}/mt2r-sw.js`;
}

export function ensureSw(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) return Promise.reject(new Error("no-sw"));
  if (!regPromise) {
    regPromise = navigator.serviceWorker.register(scriptUrl()).catch((err) => {
      regPromise = null;
      throw err;
    });
  }
  return regPromise;
}

function post<T>(msg: unknown, timeout = 5000): Promise<T> {
  return ensureSw().then(
    (reg) =>
      new Promise<T>((resolve, reject) => {
        const worker = reg.active || navigator.serviceWorker.controller || reg.waiting || reg.installing;
        if (!worker) {
          reject(new Error("worker-not-ready"));
          return;
        }
        const channel = new MessageChannel();
        const timer = window.setTimeout(() => reject(new Error("timeout")), timeout);
        channel.port1.onmessage = (event) => {
          window.clearTimeout(timer);
          resolve(event.data as T);
        };
        worker.postMessage(msg, [channel.port2]);
      }),
  );
}

export async function syncEvents(events: SwEvent[]): Promise<SwStatus> {
  const permission: SwStatus["permission"] = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
  try {
    const ready = await ensureSw();
    await navigator.serviceWorker.ready;
    const data = await post<{ trigger?: boolean; count?: number; tomorrow?: number; error?: string }>({
      type: "SCHEDULE",
      events,
    });
    void ready;
    return {
      ok: !data.error,
      trigger: Boolean(data.trigger),
      count: data.count ?? events.length,
      tomorrow: data.tomorrow ?? 0,
      permission,
      error: data.error,
    };
  } catch (err) {
    return {
      ok: false,
      trigger: false,
      count: 0,
      tomorrow: 0,
      permission,
      error: err instanceof Error ? err.message : "sync-failed",
    };
  }
}

export function swPost(msg: unknown): void {
  void post(msg).catch(() => undefined);
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof Notification === "undefined") return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export async function drainInbox(): Promise<InboxEvent[]> {
  try {
    const rows = await idbDrain("inbox");
    return rows.filter((row): row is InboxEvent => Boolean(row && typeof row === "object" && "id" in (row as InboxEvent)));
  } catch {
    return [];
  }
}

export interface SelfTestResult {
  permission: NotificationPermission | "unsupported";
  sw: boolean;
  trigger: boolean;
  eventCount: number;
  tomorrow: number;
  rescheduleMatch: boolean;
  testScheduled: boolean;
  error?: string;
}

export async function runSelfTest(events: SwEvent[]): Promise<SelfTestResult> {
  const permission = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
  try {
    const first = await syncEvents(events);
    const again = await post<{ count?: number; trigger?: boolean; tomorrow?: number }>({ type: "RESCHEDULE" });
    let testScheduled = false;
    if (permission === "granted") {
      await post({
        type: "TEST",
        delayMs: 8000,
        title: "آزمایش MT2R",
        body: "اگر این اعلان را می‌بینی، یادآوری محلی از سرویس‌ورکر رسیده است.",
      });
      testScheduled = true;
    }
    return {
      permission,
      sw: true,
      trigger: Boolean(again.trigger ?? first.trigger),
      eventCount: again.count ?? first.count,
      tomorrow: again.tomorrow ?? first.tomorrow,
      rescheduleMatch: (again.count ?? -1) === (first.count ?? -2) && (first.count ?? 0) >= 0,
      testScheduled,
      error: permission === "granted" ? undefined : "برای اعلان واقعی باید اجازه را بدهی. زمان‌بندی داخلی بدون اجازه هم ذخیره می‌شود.",
    };
  } catch (err) {
    return {
      permission,
      sw: false,
      trigger: false,
      eventCount: 0,
      tomorrow: 0,
      rescheduleMatch: false,
      testScheduled: false,
      error: err instanceof Error ? err.message : "self-test-failed",
    };
  }
}

export async function pingSw(): Promise<SwStatus> {
  const permission: SwStatus["permission"] = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
  try {
    const data = await post<{ trigger?: boolean; count?: number; tomorrow?: number }>({ type: "PING" });
    return {
      ok: true,
      trigger: Boolean(data.trigger),
      count: data.count ?? 0,
      tomorrow: data.tomorrow ?? 0,
      permission,
    };
  } catch (err) {
    return {
      ok: false,
      trigger: false,
      count: 0,
      tomorrow: 0,
      permission,
      error: err instanceof Error ? err.message : "ping-failed",
    };
  }
}
