/**
 * Notificaciones push (Web Push) sin librerías: firma VAPID (ES256) y cifrado aes128gcm (RFC 8291).
 * Las claves VAPID las crea el propio Worker la primera vez y las guarda en D1 (tabla push_config),
 * así no hay secretos en el repositorio.
 */

export interface Sub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface DBLike {
  prepare(sql: string): {
    bind(...v: unknown[]): { all<T>(): Promise<{ results: T[] }>; run(): Promise<unknown> };
    all<T>(): Promise<{ results: T[] }>;
  };
}

const te = new TextEncoder();
export const b64u = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
export const unb64u = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(s.length + ((4 - (s.length % 4)) % 4), "=")), (c) => c.charCodeAt(0));
const cat = (...a: Uint8Array[]) => {
  const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0));
  let i = 0;
  for (const x of a) (out.set(x, i), (i += x.length));
  return out;
};
async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

/* ---------- Claves VAPID ---------- */

let vapidCache: { pub: string; priv: CryptoKey } | null = null;

export async function vapid(db: DBLike) {
  if (vapidCache) return vapidCache;
  const { results } = await db.prepare("SELECT k, v FROM push_config WHERE k IN ('vapid_pub','vapid_priv')").all<{ k: string; v: string }>();
  let pub = results.find((r) => r.k === "vapid_pub")?.v;
  let privJwk = results.find((r) => r.k === "vapid_priv")?.v;
  if (!pub || !privJwk) {
    const kp = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    pub = b64u(await crypto.subtle.exportKey("raw", kp.publicKey) as ArrayBuffer);
    privJwk = JSON.stringify(await crypto.subtle.exportKey("jwk", kp.privateKey));
    // Si otra ejecución las creó a la vez, gana la primera (INSERT OR IGNORE) y se vuelven a leer
    await db.prepare("INSERT OR IGNORE INTO push_config (k, v) VALUES ('vapid_pub', ?)").bind(pub).run();
    await db.prepare("INSERT OR IGNORE INTO push_config (k, v) VALUES ('vapid_priv', ?)").bind(privJwk).run();
    vapidCache = null;
    return vapid(db);
  }
  const priv = await crypto.subtle.importKey("jwk", JSON.parse(privJwk), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  vapidCache = { pub, priv };
  return vapidCache;
}

async function vapidHeader(endpoint: string, v: { pub: string; priv: CryptoKey }, subject: string) {
  const aud = new URL(endpoint).origin;
  const h = b64u(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const p = b64u(te.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, v.priv, te.encode(`${h}.${p}`));
  return `vapid t=${h}.${p}.${b64u(sig)}, k=${v.pub}`;
}

/* ---------- Cifrado aes128gcm (RFC 8291 + RFC 8188) ---------- */

export async function encrypt(sub: Sub, payload: Uint8Array, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const uaPub = unb64u(sub.keys.p256dh);
  const auth = unb64u(sub.keys.auth);
  const as = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPub = new Uint8Array((await crypto.subtle.exportKey("raw", as.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey } as EcdhKeyDeriveParams, as.privateKey, 256));

  const prkKey = await hmac(auth, ecdh);
  const ikm = await hmac(prkKey, cat(te.encode("WebPush: info\0"), uaPub, asPub, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(te.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(te.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);

  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, cat(payload, new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

/** Envía una notificación. Devuelve el código HTTP del servicio push (404/410 = suscripción caducada). */
export async function sendPush(db: DBLike, sub: Sub, data: unknown, subject: string) {
  const v = await vapid(db);
  const body = await encrypt(sub, te.encode(JSON.stringify(data)));
  const r = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      authorization: await vapidHeader(sub.endpoint, v, subject),
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: "1800",
      urgency: "high",
    },
    body,
  });
  return r.status;
}
