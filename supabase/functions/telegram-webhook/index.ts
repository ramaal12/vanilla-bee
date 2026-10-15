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
  const m = /^(acc|rej):([0-9a-f-]{36})$/i.exec(String(cq.data ?? ""));
  if (!m) { await tg("answerCallbackQuery", { callback_query_id: cq.id }); return ok(); }
  const [, action, id] = m;
  const patch = action === "acc" ? { status: "preparing" } : { status: "cancelled", reject_reason: "رُفض عبر تيليجرام" };
  const r = await db(`orders?id=eq.${id}&status=eq.pending_approval`, { method: "PATCH", body: JSON.stringify(patch) });
  let o = (await r.json())?.[0];
  let note: string;
  if (o) {
    note = action === "acc" ? "✅ تم قبول الطلب" : "❌ تم رفض الطلب";
    if (action === "rej" && o.payment_status === "paid") note += "\n⚠️ الطلب مدفوع إلكترونياً: يلزم استرداد المبلغ من لوحة Moyasar";
  } else {
    o = (await (await db(`orders?id=eq.${id}&select=status,order_no`)).json())?.[0];
    note = o ? `ℹ️ تم التعامل مع الطلب مسبقاً (${STATUS[o.status] ?? o.status})` : "⚠️ الطلب غير موجود";
  }
  await tg("answerCallbackQuery", { callback_query_id: cq.id, text: note.split("\n")[0] });
  if (cq.message?.message_id) {
    await tg("editMessageText", { chat_id: chatId, message_id: cq.message.message_id,
      text: `${cq.message.text ?? ""}\n\n${note}`, disable_web_page_preview: true });   // يزيل الأزرار
  }
  return ok();
}
if (import.meta.main) Deno.serve(handler);
