// Vanilla Bee — telegram-webhook: أزرار قبول/رفض في رسالة تيليجرام
// Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_WEBHOOK_SECRET
const env = (k: string) => Deno.env.get(k) ?? "";
const ok = () => new Response("ok");

function db(path: string, init: RequestInit = {}) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  return fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, { ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json",
      Prefer: "return=representation", ...(init.headers ?? {}) } });
}
function tg(method: string, body: unknown) {
  return fetch(`https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
function safeEqual(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const SEP = "\n\n— الحالة: ";
// الإجراء → الانتقال المسموح
const STEP: Record<string, { from: string[]; to: string; type?: string }> = {
  acc: { from: ["pending_approval", "new"], to: "preparing" },
  rej: { from: ["pending_approval", "new"], to: "cancelled" },
  rdy: { from: ["preparing"], to: "ready" },
  out: { from: ["ready"], to: "out_for_delivery", type: "delivery" },
  don: { from: ["ready", "out_for_delivery"], to: "done" },
};
export function nextButtons(o: { id: string; status: string; type: string }) {
  const b = (t: string, a: string) => ({ text: t, callback_data: `${a}:${o.id}` });
  switch (o.status) {
    case "pending_approval": case "new": return [b("✅ قبول", "acc"), b("❌ رفض", "rej")];
    case "preparing": return [b("✅ تم التحضير", "rdy")];
    case "ready": return o.type === "delivery" ? [b("🛵 المندوب استلم الطلب", "out")] : [b("📦 تم التسليم", "don")];
    case "out_for_delivery": return [b("📦 تم التسليم", "don")];
    default: return [];
  }
}
export function statusLine(o: { status: string; type: string }) {
  const m: Record<string, string> = {
    pending_approval: "⏳ بانتظار الموافقة", new: "⏳ بانتظار الموافقة", preparing: "👩‍🍳 تم القبول - قيد التحضير",
    ready: o.type === "delivery" ? "✅ جاهز - بانتظار المندوب" : "✅ جاهز للاستلام",
    out_for_delivery: "🛵 مع المندوب", done: "📦 تم التسليم", cancelled: "❌ مرفوض/ملغي" };
  return m[o.status] ?? o.status;
}
const STATUS: Record<string, string> = { pending_approval: "بانتظار الموافقة", new: "جديد", preparing: "قيد التحضير",
  ready: "جاهز", out_for_delivery: "خرج للتوصيل", done: "مكتمل", cancelled: "ملغي/مرفوض" };

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  const secret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!safeEqual(env("TELEGRAM_WEBHOOK_SECRET"), secret)) return new Response("forbidden", { status: 401 });
  let u: any; try { u = await req.json(); } catch { return ok(); }
  const cq = u.callback_query;
  if (!cq) return ok();                                         // نتجاهل أي رسائل أخرى
  const chatId = String(cq.message?.chat?.id ?? "");
  if (chatId !== env("TELEGRAM_CHAT_ID")) {
    await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "غير مصرح" });
    return ok();
  }
  const m = /^(acc|rej|rdy|out|don):([0-9a-f-]{36})$/i.exec(String(cq.data ?? ""));
  if (!m) { await tg("answerCallbackQuery", { callback_query_id: cq.id }); return ok(); }
  const [, action, id] = m;
  const cur = (await (await db(`orders?id=eq.${id}&select=id,status,type,payment_status,moyasar_payment_id`)).json())?.[0];
  let note: string, o: any = null;
  const step = cur ? STEP[action] : null;
  if (!cur) note = "⚠️ الطلب غير موجود";
  else if (!step || !step.from.includes(cur.status) || (step.type && step.type !== cur.type)
           || (action === "don" && cur.status === "ready" && cur.type !== "pickup")) {
    note = `ℹ️ لا يمكن تنفيذ هذا الإجراء الآن (الحالة: ${STATUS[cur.status] ?? cur.status})`;
    o = cur;
  } else {
    const patch: Record<string, unknown> = { status: step.to };
    if (action === "rej") patch.reject_reason = "رُفض عبر تيليجرام";
    // تحديث مشروط على الحالة الحالية (يمنع السباق والتكرار)
    const r = await db(`orders?id=eq.${id}&status=eq.${cur.status}`, { method: "PATCH", body: JSON.stringify(patch) });
    o = r.ok ? (await r.json())?.[0] : null;
    if (o) {
      note = statusLine(o);
      if (action === "rej" && o.payment_status === "paid") note += "\n⚠️ مدفوع إلكترونياً: يلزم استرداد المبلغ من لوحة Moyasar";
    } else { note = "ℹ️ تم تحديث الطلب مسبقاً"; o = cur; }
  }
  await tg("answerCallbackQuery", { callback_query_id: cq.id, text: note.split("\n")[0].slice(0, 190) });
  if (cq.message?.message_id) {
    const base = String(cq.message.text ?? "").split(SEP)[0];
    const extra = note.startsWith("ℹ️") || note.startsWith("⚠️") ? "\n" + note : (note.includes("\n") ? "\n" + note.split("\n").slice(1).join("\n") : "");
    const btn = o ? nextButtons(o) : [];
    await tg("editMessageText", { chat_id: chatId, message_id: cq.message.message_id,
      text: `${base}${SEP}${o ? statusLine(o) : ""}${extra}`,
      disable_web_page_preview: true, reply_markup: { inline_keyboard: btn.length ? [btn] : [] } });
  }
  return ok();
}
if (import.meta.main) Deno.serve(handler);
