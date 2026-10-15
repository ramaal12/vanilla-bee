// Vanilla Bee — verify-payment
// يتحقق من عملية الدفع عند Moyasar، يحدّث الطلب إلى "مدفوع"، ويرسل إشعار تيليجرام.
// Secrets: MOYASAR_SECRET_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, (اختياري) ALLOW_TEST_ORDERS=true
// SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY موجودة تلقائياً في Supabase.

const env = (k: string) => Deno.env.get(k) ?? "";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function db(path: string, init: RequestInit = {}) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  return fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json",
      Prefer: "return=representation", ...(init.headers ?? {}) },
  });
}

const TYPE: Record<string, string> = { delivery: "🚗 توصيل", pickup: "🏪 استلام من الفرع" };
const escHtml = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

export function telegramText(o: any): string {
  const time = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
    timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }).format(new Date(o.paid_at ?? o.created_at));
  const items = (o.items ?? []).map((l: any) =>
    `• <b>${escHtml(l.name)}</b> × ${l.qty} — ${Number(l.unit * l.qty).toFixed(2)} ر.س` +
    ((l.opts ?? []).length ? `\n   ${(l.opts as string[]).map(escHtml).join(" · ")}` : "")).join("\n");
  const where = o.type === "delivery"
    ? `📍 ${escHtml(o.district)} - ${escHtml(o.address)}${o.map_link ? `\n🗺 ${escHtml(o.map_link)}` : ""}`
    : `🏪 ${escHtml(o.branch)} — ${escHtml(o.pickup_time)}`;
  return [
    `🐝 <b>طلب جديد ${escHtml(o.order_no)}</b>${o.payment_status === "test" ? " (تجريبي)" : ""}`,
    o.payment_method === "cash" ? "💵 <b>الدفع: كاش عند الاستلام</b>" : (o.payment_status === "paid" ? "💳 مدفوع إلكترونياً" : null),
    `👤 ${escHtml(o.customer_name)}`,
    `📞 ${escHtml(o.phone)}`,
    `${TYPE[o.type] ?? o.type}`,
    where,
    "",
    items,
    "",
    o.delivery_fee > 0 ? `رسوم التوصيل: ${Number(o.delivery_fee).toFixed(2)} ر.س` : null,
    `💰 <b>الإجمالي: ${Number(o.total).toFixed(2)} ر.س</b>`,
    `🕒 ${time}`,
  ].filter((x) => x !== null).join("\n");
}

async function sendTelegram(o: any) {
  const token = env("TELEGRAM_BOT_TOKEN"), chat = env("TELEGRAM_CHAT_ID");
  if (!token || !chat) return false;
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: telegramText(o), parse_mode: "HTML", disable_web_page_preview: true }),
  });
  if (!r.ok) console.error("telegram", r.status, await r.text());
  return r.ok;
}

async function markNotified(id: string) {
  // يرجع الصف فقط إذا لم يُرسل إشعار من قبل (يمنع التكرار)
  const r = await db(`orders?id=eq.${id}&notified_at=is.null`, {
    method: "PATCH", body: JSON.stringify({ notified_at: new Date().toISOString() }) });
  return (await r.json())?.[0] ?? null;
}

const publicView = (o: any) => ({
  order_no: o.order_no, type: o.type, district: o.district, address: o.address, branch: o.branch,
  pickup_time: o.pickup_time, items: o.items, subtotal: o.subtotal, delivery_fee: o.delivery_fee,
  total: o.total, payment_status: o.payment_status, payment_method: o.payment_method,
});

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const orderId = String(body.order_id ?? ""), paymentId = String(body.payment_id ?? "");
  if (body.action === "confirm-cash") {
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error: "bad input" }, 400);
    const cr = await db(`orders?id=eq.${orderId}&select=*`);
    const o = (await cr.json())?.[0];
    if (!o) return json({ error: "order not found" }, 404);
    if (o.payment_method !== "cash" || o.payment_status !== "cash_pending") return json({ error: "not a cash order" }, 409);
    if (o.notified_at) return json({ ok: true, telegram: "already", order: publicView(o) });
    if (Date.now() - new Date(o.created_at).getTime() > 15 * 60 * 1000) return json({ error: "expired" }, 410);
    const claimed = await markNotified(o.id);
    const tgOk = claimed ? await sendTelegram(claimed) : "already";
    return json({ ok: true, telegram: tgOk, order: publicView(o) });
  }
  if (!/^[0-9a-f-]{36}$/i.test(orderId) || !/^[A-Za-z0-9_-]{2,64}$/.test(paymentId))
    return json({ error: "bad input" }, 400);

  const r = await db(`orders?id=eq.${orderId}&select=*`);
  const order = (await r.json())?.[0];
  if (!order) return json({ error: "order not found" }, 404);
  if (order.payment_method === "cash") return json({ error: "cash order" }, 409);
  if (order.payment_status === "paid" || order.payment_status === "test")
    return json({ ok: true, order: publicView(order) });               // تم التحقق مسبقاً

  let newStatus: "paid" | "failed" | "test";
  if (paymentId === "TEST") {
    if (env("ALLOW_TEST_ORDERS") !== "true") return json({ error: "test orders disabled" }, 403);
    newStatus = "test";
  } else {
    const pr = await fetch(`https://api.moyasar.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: "Basic " + btoa(env("MOYASAR_SECRET_KEY") + ":") },
    });
    if (!pr.ok) return json({ error: "payment lookup failed" }, 502);
    const p = await pr.json();
    const expected = Math.round(Number(order.total) * 100);
    const matches = p.amount === expected && p.currency === "SAR" && p.metadata?.order_id === order.id;
    if (!matches) return json({ error: "payment does not match order" }, 409);
    newStatus = p.status === "paid" ? "paid" : "failed";
  }

  // تحديث مشروط: فقط إذا كان الطلب ما زال pending (يمنع تكرار الإشعار)
  const u = await db(`orders?id=eq.${orderId}&payment_status=eq.pending`, {
    method: "PATCH",
    body: JSON.stringify({
      payment_status: newStatus,
      moyasar_payment_id: paymentId === "TEST" ? null : paymentId,
      paid_at: newStatus === "failed" ? null : new Date().toISOString(),
    }),
  });
  const updated = (await u.json())?.[0];
  if (updated && newStatus !== "failed") { const c = await markNotified(updated.id); if (c) await sendTelegram(c); }
  const final = updated ?? order;
  return json({ ok: newStatus !== "failed", order: publicView({ ...final, payment_status: final.payment_status }) },
    newStatus === "failed" ? 402 : 200);
}

if (import.meta.main) Deno.serve(handler);
