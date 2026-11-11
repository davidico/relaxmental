"use client";

import { useEffect, useState } from "react";
import { useData } from "@/lib/data";

type St = "hidden" | "off" | "working" | "on" | "denied" | "error";

const keyBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(s.length + ((4 - (s.length % 4)) % 4), "=")), (c) => c.charCodeAt(0));

/** Aviso para activar las notificaciones de cada bloque. Desaparece cuando ya están activas. */
export default function PushBanner() {
  const { mode } = useData();
  const [st, setSt] = useState<St>("hidden");
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

  if (st === "hidden" || (st === "on" && !msg)) return null;
  return (
    <div className={`card pushbanner${st === "on" ? " ok" : ""}`} role={st === "error" || st === "denied" ? "alert" : "status"}>
      <span className="pb-ico" aria-hidden="true">{st === "on" ? "✓" : "🔔"}</span>
      <div className="pb-txt">
        {st === "on" ? (
          <strong>{msg}</strong>
        ) : st === "denied" ? (
          <>
            <strong>Las notificaciones están bloqueadas</strong>
            <span>Actívalas en los ajustes del teléfono: Ajustes → Apps → Mi Semana (o Chrome) → Notificaciones.</span>
          </>
        ) : st === "error" ? (
          <>
            <strong>No se pudieron activar los avisos</strong>
            <span>Revisa tu conexión e inténtalo otra vez.</span>
          </>
        ) : (
          <>
            <strong>Activa los avisos</strong>
            <span>Te aviso al empezar cada bloque de tu día, aunque tengas la app cerrada.</span>
          </>
        )}
      </div>
      {(st === "off" || st === "working" || st === "error") && (
        <button className="btn" onClick={activar} disabled={st === "working"}>
          {st === "working" ? "Activando…" : st === "error" ? "Reintentar" : "Activar avisos"}
        </button>
      )}
    </div>
  );
}
