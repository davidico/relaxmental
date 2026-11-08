"use client";

import { useState } from "react";
import { useData } from "@/lib/data";

export default function Login() {
  const { signIn } = useData();
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div style={{ maxWidth: 440 }}>
      <h1>Entrar</h1>
      <p className="sub">Te enviamos un enlace a tu correo. Ábrelo en este dispositivo y entras sin contraseña.</p>
      <div className="card">
        <form
          className="add"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const err = await signIn(email.trim());
            setBusy(false);
            setMsg(err ? { ok: false, text: `No se pudo enviar el enlace: ${err}` } : { ok: true, text: `Enlace enviado a ${email}. Revisa tu correo.` });
          }}
        >
          <input id="login-email" type="email" required placeholder="tu@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "Enviando…" : "Enviarme el enlace"}
            </button>
          </div>
          {msg && <div className={msg.ok ? "banner ok" : "banner"}>{msg.text}</div>}
        </form>
      </div>
    </div>
  );
}
