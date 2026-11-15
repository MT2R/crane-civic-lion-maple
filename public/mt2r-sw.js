/* MT2R local alarms.
   Exact OS alarms need TimestampTrigger (some Chrome/Android builds).
   Otherwise this worker uses timers while it stays alive, and the page
   catches up when it is opened. This is not a substitute for native
   AlarmManager / UNUserNotificationCenter, and it does not pretend to be. */
const DB = "mt2r-sw-v1";
const LATE_MS = 20 * 60 * 1000;
let timers = [];
let watch = 0;
let ring = 0;
const shown = new Set();

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains("kv")) req.result.createObjectStore("kv");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function kvGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readonly");
    const g = tx.objectStore("kv").get(key);
    g.onsuccess = () => resolve(g.result);
    g.onerror = () => reject(g.error);
    tx.oncomplete = () => db.close();
  });
}

async function kvSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(value, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function pushInbox(event) {
  const prev = (await kvGet("inbox")) || [];
  prev.push(event);
  await kvSet("inbox", prev.slice(-100));
  const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clientsList) client.postMessage({ type: "INBOX" });
}

function hasTrigger() {
  return typeof TimestampTrigger === "function";
}

function tomorrowCount(events) {
  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return events.filter((ev) => ev.date && ev.date !== key).length;
}

function optionsFor(ev, renotify) {
  return {
    tag: ev.tag,
    body: ev.body || "",
    lang: "fa",
    dir: "rtl",
    renotify: Boolean(renotify),
    requireInteraction: ev.mode === "alarm",
    silent: false,
    vibrate: ev.mode === "alarm" ? [400, 150, 400, 150, 700] : ev.mode === "loud" ? [200, 100, 200] : [80],
    data: {
      itemId: ev.itemId,
      date: ev.date,
      moment: ev.when,
      snoozeMinutes: ev.snoozeMinutes || 10,
      tag: ev.tag,
      mode: ev.mode,
    },
    actions: [
      { action: "done", title: "انجام شد" },
      { action: "snooze", title: "تعویق" },
    ],
  };
}

async function show(ev, renotify) {
  if (!ev) return;
  if (await kvGet("ack:" + ev.tag)) return;
  const suppress = await kvGet("suppress:" + ev.tag);
  if (!renotify && typeof suppress === "number" && suppress > Date.now()) return;
  const fg = await kvGet("foregroundUntil");
  if (!renotify && typeof fg === "number" && fg > Date.now()) {
    const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clientsList) client.postMessage({ type: "ALARM", payload: ev });
    return;
  }
  if (!renotify && shown.has(ev.tag)) return;
  try {
    await self.registration.showNotification(ev.title || "MT2R", optionsFor(ev, renotify));
  } catch {
    return;
  }
  shown.add(ev.tag);
  if (ev.mode === "alarm") startRing(ev);
}

function startRing(ev) {
  if (ring) clearInterval(ring);
  let n = 0;
  ring = setInterval(() => {
    n += 1;
    if (n > 6) {
      clearInterval(ring);
      ring = 0;
      return;
    }
    kvGet("ack:" + ev.tag).then((ack) => {
      if (ack) {
        clearInterval(ring);
        ring = 0;
        return;
      }
      show(ev, true).catch(() => undefined);
    });
  }, 20000);
}

function clearTimers() {
  timers.forEach((id) => clearTimeout(id));
  timers = [];
  if (watch) clearInterval(watch);
  watch = 0;
}

async function checkDue(events) {
  const now = Date.now();
  const due = (events || []).filter((ev) => ev.when <= now && now - ev.when < LATE_MS).sort((a, b) => b.when - a.when);
  for (let i = 0; i < due.length; i++) await show(due[i], false);
}

async function arm(events) {
  clearTimers();
  const list = Array.isArray(events) ? events : [];
  await kvSet("events", list);
  const future = list.filter((ev) => ev.when > Date.now() - 5000);
  if (hasTrigger()) {
    let existing = [];
    try {
      existing = await self.registration.getNotifications({ includeTriggered: true });
    } catch {
      existing = await self.registration.getNotifications();
    }
    for (const note of existing) {
      if (note.tag && note.tag.startsWith("mt2r-sched-")) note.close();
    }
    for (const ev of future) {
      try {
        await self.registration.showNotification(ev.title || "MT2R", {
          ...optionsFor(ev, false),
          showTrigger: new TimestampTrigger(ev.when),
        });
      } catch {
        const delay = ev.when - Date.now();
        if (delay > 0 && delay < 36 * 3600 * 1000) timers.push(setTimeout(() => show(ev, false), delay));
      }
    }
  } else {
    for (const ev of future) {
      const delay = ev.when - Date.now();
      if (delay >= 0 && delay < 36 * 3600 * 1000) timers.push(setTimeout(() => show(ev, false), delay));
    }
    watch = setInterval(() => {
      kvGet("events").then((rows) => checkDue(rows || []));
    }, 15000);
  }
  await checkDue(list);
  return { trigger: hasTrigger(), count: future.length, tomorrow: tomorrowCount(future) };
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.clients.claim().then(async () => {
      const events = (await kvGet("events")) || [];
      await arm(events);
    }),
  );
});

self.addEventListener("message", (event) => {
  const msg = event.data || {};
  const reply = (data) => {
    if (event.ports && event.ports[0]) event.ports[0].postMessage(data);
  };
  event.waitUntil(
    (async () => {
      try {
        if (msg.type === "SCHEDULE") {
          const info = await arm(msg.events || []);
          reply({ ok: true, ...info });
          return;
        }
        if (msg.type === "RESCHEDULE") {
          const events = (await kvGet("events")) || [];
          const info = await arm(events);
          reply({ ok: true, ...info });
          return;
        }
        if (msg.type === "PING") {
          const events = (await kvGet("events")) || [];
          const future = events.filter((ev) => ev.when > Date.now() - 5000);
          reply({ ok: true, trigger: hasTrigger(), count: future.length, tomorrow: tomorrowCount(future) });
          return;
        }
        if (msg.type === "FOREGROUND") {
          await kvSet("foregroundUntil", msg.ms ? Date.now() + msg.ms : 0);
          reply({ ok: true });
          return;
        }
        if (msg.type === "SUPPRESS") {
          await kvSet("suppress:" + msg.tag, Date.now() + (msg.ms || 8000));
          reply({ ok: true });
          return;
        }
        if (msg.type === "ACK") {
          await kvSet("ack:" + msg.tag, 1);
          reply({ ok: true });
          return;
        }
        if (msg.type === "CHECK") {
          const events = (await kvGet("events")) || [];
          await checkDue(events);
          reply({ ok: true });
          return;
        }
        if (msg.type === "TEST") {
          const delay = Math.max(1000, Math.min(msg.delayMs || 8000, 60000));
          const ev = {
            tag: "mt2r-test",
            title: msg.title || "آزمایش MT2R",
            body: msg.body || "اعلان آزمایشی",
            mode: "alarm",
            when: Date.now() + delay,
            itemId: msg.itemId || "breakfast",
            date: msg.date || "",
            snoozeMinutes: 5,
          };
          if (hasTrigger()) {
            await self.registration.showNotification(ev.title, {
              ...optionsFor(ev, true),
              showTrigger: new TimestampTrigger(ev.when),
            });
          } else {
            setTimeout(() => show(ev, true), delay);
          }
          reply({ ok: true, trigger: hasTrigger() });
          return;
        }
        reply({ ok: false, error: "unknown" });
      } catch (err) {
        reply({ ok: false, error: String(err && err.message ? err.message : err) });
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  event.notification.close();
  event.waitUntil(
    (async () => {
      await kvSet("ack:" + (event.notification.tag || data.tag || ""), 1);
      if (event.action === "done" || event.action === "snooze") {
        const snoozeUntil = event.action === "snooze" ? Date.now() + (data.snoozeMinutes || 10) * 60000 : undefined;
        await pushInbox({
          id: `${data.tag || event.notification.tag}-${event.action}-${Date.now()}`,
          type: event.action === "snooze" ? "snooze" : "done",
          itemId: data.itemId,
          date: data.date,
          moment: data.moment,
          snoozeUntil,
          at: Date.now(),
        });
        if (event.action === "snooze" && data.itemId) {
          const ev = {
            tag: `mt2r-sched-${data.itemId}-${data.date}-${snoozeUntil}`,
            when: snoozeUntil,
            title: event.notification.title,
            body: event.notification.body,
            mode: data.mode || "alarm",
            itemId: data.itemId,
            date: data.date,
            snoozeMinutes: data.snoozeMinutes || 10,
          };
          const events = (await kvGet("events")) || [];
          events.push(ev);
          await arm(events);
        }
        return;
      }
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const target = `/?alarm=${encodeURIComponent(data.itemId || "")}&date=${encodeURIComponent(data.date || "")}`;
      if (clientsList[0]) {
        clientsList[0].postMessage({ type: "ALARM", payload: { ...data, title: event.notification.title, tag: event.notification.tag } });
        await clientsList[0].focus();
      } else if (self.clients.openWindow) {
        await self.clients.openWindow(target);
      }
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const host = self.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return;
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open("mt2r-shell-v1");
      try {
        const res = await fetch(req);
        if (res.ok && (req.mode === "navigate" || url.pathname.startsWith("/assets/"))) cache.put(req, res.clone());
        return res;
      } catch {
        const hit = await cache.match(req);
        if (hit) return hit;
        if (req.mode === "navigate") {
          const home = await cache.match("/");
          if (home) return home;
        }
        return new Response("آفلاین", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
      }
    })(),
  );
});
