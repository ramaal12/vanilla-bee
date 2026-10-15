// Vanilla Bee — order-status: يرجّع حالة الطلب فقط لمن يملك رمز الطلب (access_token)
const env = (k: string) => Deno.env.get(k) ?? "";
const CORS = { "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let b: any; try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const id = String(b.order_id ?? ""), token = String(b.token ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f]{32,64}$/.test(token)) return json({ error: "bad input" }, 400);
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const r = await fetch(`${env("SUPABASE_URL")}/rest/v1/orders?id=eq.${id}&select=access_token,status,payment_status,reject_reason`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  const o = (await r.json())?.[0];
  if (!o || !o.access_token || !safeEqual(o.access_token, token)) return json({ error: "not found" }, 404);
  return json({ status: o.status, payment_status: o.payment_status,
    reject_reason: o.status === "cancelled" ? o.reject_reason : null });
}
if (import.meta.main) Deno.serve(handler);
