"use client";

import { useEffect, useState } from "react";
import { useData } from "@/lib/data";

export type PushSt = "hidden" | "off" | "working" | "on" | "denied" | "error";

const keyBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(s.length + ((4 - (s.length % 4)) % 4), "=")), (c) => c.charCodeAt(0));

/**
 * Estado de los avisos en este dispositivo y cómo activarlos.
 * «hidden»: aquí no se puede (sin cuenta o el navegador no los permite).
 */
export function usePush() {
  const { mode } = useData();
  const [st, setSt] = useState<PushSt>("hidden");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (mode !== "cloud" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    if (Notification.permission === "denied") return setSt("denied");
    navigator.serviceWorker.ready
      .then((r) => r.pushManager.getSubscription())
      .then(async (s) => {
        if (!s) return setSt("off");
        // Ya suscrito: lo reenviamos por si la base de datos no lo tiene (p. ej. al cambiar las claves)
        await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(s) }).catch(() => {});
        setSt("on");
      })
      .catch(() => setSt("off"));
  }, [mode]);

  const activar = async () => {
    setSt("working");
    setMsg("");
    try {
      if ((await Notification.requestPermission()) !== "granted") return setSt("denied");
      const reg = await navigator.serviceWorker.ready;
      const { key } = (await (await fetch("/api/push/key")).json()) as { key: string };
      let sub = await reg.pushManager.getSubscription();
      if (sub && sub.options.applicationServerKey) {
        const cur = new Uint8Array(sub.options.applicationServerKey);
        const want = keyBytes(key);
        if (cur.length !== want.length || cur.some((b, i) => b !== want[i])) (await sub.unsubscribe(), (sub = null));
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
      const r = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub) });
      if (!r.ok) throw new Error(String(r.status));
      await fetch("/api/push/test", { method: "POST" });
      setSt("on");
      setMsg("Listo. Te acaba de llegar un aviso de prueba.");
    } catch {
      setSt("error");
    }
  };

  return { st, msg, activar };
}
