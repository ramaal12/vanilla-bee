// Vanilla Bee — rate-order: تقييم واحد لكل طلب مكتمل، بالرمز الخاص بالطلب
// Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
const env = (k: string) => Deno.env.get(k) ?? "";
const CORS = { "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
function db(path: string, init: RequestInit = {}) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  return fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, { ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json",
      Prefer: "return=representation", ...(init.headers ?? {}) } });
}
function safeEqual(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const esc = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let b: any; try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const id = String(b.order_id ?? ""), token = String(b.token ?? ""), rating = Number(b.rating);
  const comment = String(b.comment ?? "").trim().slice(0, 500) || null;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f]{32,64}$/.test(token) || !Number.isInteger(rating) || rating < 1 || rating > 5)
    return json({ error: "bad input" }, 400);
  const o = (await (await db(`orders?id=eq.${id}&select=id,order_no,customer_name,access_token,status,rated_at`)).json())?.[0];
  if (!o || !safeEqual(o.access_token ?? "", token)) return json({ error: "not found" }, 404);
  if (o.status !== "done") return json({ error: "order not completed" }, 409);
  if (o.rated_at) return json({ error: "already rated" }, 409);
  const u = await db(`orders?id=eq.${id}&rated_at=is.null`, { method: "PATCH",
    body: JSON.stringify({ rating, rating_comment: comment, rated_at: new Date().toISOString() }) });
  const saved = (await u.json())?.[0];
  if (!saved) return json({ error: "already rated" }, 409);
  const token_ = env("TELEGRAM_BOT_TOKEN"), chat = env("TELEGRAM_CHAT_ID");
  let tg = false;
  if (token_ && chat) {
    const r = await fetch(`https://api.telegram.org/bot${token_}/sendMessage`, { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, parse_mode: "HTML", text:
        `⭐ <b>تقييم جديد ${esc(o.order_no)}</b>\n${"⭐".repeat(rating)}${"☆".repeat(5 - rating)} (${rating}/5)\n👤 ${esc(o.customer_name)}` +
        (comment ? `\n💬 ${esc(comment)}` : "") }) });
    tg = r.ok;
  }
  return json({ ok: true, telegram: tg });
}
if (import.meta.main) Deno.serve(handler);
