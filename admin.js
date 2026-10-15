(function(){
const C=window.VB_CONFIG,$=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const STATUS={new:"جديد",preparing:"قيد التحضير",ready:"جاهز",out_for_delivery:"خرج للتوصيل",done:"مكتمل",cancelled:"ملغي"};
const PAY={pending:"بانتظار الدفع",paid:"مدفوع",test:"تجريبي",failed:"فشل الدفع"};
const OPEN=["new","preparing","ready","out_for_delivery"];
const sar=n=>Number(n||0).toFixed(2)+" ر.س";
const tz="Asia/Riyadh";
const fmtTime=d=>new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory",{timeZone:tz,hour:"2-digit",minute:"2-digit"}).format(new Date(d));
const riyadhDay=d=>new Intl.DateTimeFormat("en-CA",{timeZone:tz}).format(d?new Date(d):new Date()); // YYYY-MM-DD
const isDone=o=>o.payment_status==="paid"||o.payment_status==="test";
if(!/^https:\/\//.test(C.SUPABASE_URL||"")||/^PUT_/.test(C.SUPABASE_ANON_KEY||"")){$("#cfgNotice").hidden=false;$("#loginForm").hidden=true;return}
const sb=window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY);
window.__vbAdmin={sb};
let orders=new Map(),channel=null,audioCtx=null;
$("#fStatus").innerHTML+=Object.entries(STATUS).map(([k,v])=>`<option value="${k}">${v}</option>`).join("");
$("#fDate").value=riyadhDay();

// ---- auth ----
$("#loginForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),em=String(f.get("email")).trim(),pw=String(f.get("password"));
 $("#loginErr").textContent="";
 if(!/^\S+@\S+\.\S+$/.test(em)||pw.length<6){$("#loginErr").textContent="أدخل بريد وكلمة مرور صحيحة";return}
 primeAlerts();
 const {error}=await sb.auth.signInWithPassword({email:em,password:pw});
 if(error){$("#loginErr").textContent="بيانات الدخول غير صحيحة";return}
 start()};
async function start(){
 const {data:{session}}=await sb.auth.getSession();if(!session)return;
 const {data:admin}=await sb.rpc("is_admin");
 if(!admin){$("#loginErr").textContent="هذا الحساب ليس لديه صلاحية الإدارة";await sb.auth.signOut();return}
 $("#loginBox").hidden=true;$("#dash").hidden=false;
 $("#who").innerHTML=`<span style="font-size:.85rem">${esc(session.user.email)}</span> <button class="btn ghost" id="logout">خروج</button>`;
 $("#logout").onclick=async()=>{await sb.auth.signOut();location.reload()};
 await load();subscribe();
}
// ---- data ----
async function load(){
 const day=$("#fDate").value||riyadhDay();
 const from=new Date(day+"T00:00:00+03:00").toISOString(),to=new Date(day+"T23:59:59.999+03:00").toISOString();
 const {data,error}=await sb.from("orders").select("*").gte("created_at",from).lte("created_at",to).order("created_at",{ascending:false});
 if(error){$("#list").innerHTML=`<div class="notice">خطأ في التحميل: ${esc(error.message)}</div>`;return}
 orders=new Map(data.map(o=>[o.id,o]));render();
}
function subscribe(){
 if(channel)sb.removeChannel(channel);
 channel=sb.channel("orders-live").on("postgres_changes",{event:"*",schema:"public",table:"orders"},onChange)
  .subscribe(s=>{$("#live").classList.toggle("on",s==="SUBSCRIBED");$("#live").textContent=s==="SUBSCRIBED"?"● مباشر":"○ غير متصل"});
}
function onChange(ev){
 const o=ev.new;if(!o||!o.id)return;
 const prev=orders.get(o.id)||ev.old;
 const becamePaid=isDone(o)&&!(prev&&isDone(prev));
 if(riyadhDay(o.created_at)===$("#fDate").value)orders.set(o.id,o);
 render(becamePaid?o.id:null);
 if(becamePaid)alertNew(o);
}
window.__vbOnChange=onChange;
// ---- render ----
function render(flashId){
 const all=[...orders.values()].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));const st=$("#fStatus").value,pay=$("#fPay").value;
 const paid=all.filter(o=>isDone(o)&&o.status!=="cancelled");
 $("#sCount").textContent=paid.length;
 $("#sTotal").textContent=sar(paid.reduce((a,o)=>a+Number(o.total),0));
 $("#sSplit").textContent=paid.filter(o=>o.type==="delivery").length+" / "+paid.filter(o=>o.type==="pickup").length;
 $("#sOpen").textContent=paid.filter(o=>OPEN.includes(o.status)).length;
 const list=all.filter(o=>(!st||o.status===st)&&(!pay||isDone(o)));
 $("#list").innerHTML=list.length?list.map(o=>`<div class="ord s-${o.status}${o.id===flashId?" flash":""}" data-id="${o.id}">
  <div class="row"><b>${esc(o.order_no)}</b><span>${fmtTime(o.created_at)}</span></div>
  <div class="row"><span>${esc(o.customer_name)} · ${o.type==="delivery"?"🚗 توصيل":"🏪 استلام"}</span><b>${sar(o.total)}</b></div>
  <div><span class="badge">${STATUS[o.status]}</span><span class="badge pay-${o.payment_status}">${PAY[o.payment_status]}</span>
  <small style="color:#777"> ${o.items.map(l=>esc(l.name)+" ×"+l.qty).join("، ")}</small></div></div>`).join(""):`<div class="empty">لا توجد طلبات</div>`;
 const open=$("#detail").dataset.id;if(open&&$("#detail").classList.contains("open"))showDetail(open);
}
function showDetail(id){
 const o=orders.get(id);if(!o)return;$("#detail").dataset.id=id;
 $("#detailSheet").innerHTML=`<div class="row"><h3>طلب ${esc(o.order_no)}</h3><button class="btn ghost" data-close>✕</button></div>
 <p><span class="badge">${STATUS[o.status]}</span><span class="badge pay-${o.payment_status}">${PAY[o.payment_status]}</span></p>
 <p>👤 ${esc(o.customer_name)}<br>📞 <a href="tel:${esc(o.phone)}" dir="ltr">${esc(o.phone)}</a> · <a href="https://wa.me/966${esc(String(o.phone).replace(/^\+?966|^0/,""))}" target="_blank">واتساب</a><br>
 🕒 ${fmtTime(o.created_at)}</p>
 <p>${o.type==="delivery"?`🚗 توصيل: ${esc(o.district)} - ${esc(o.address)}${o.map_link?`<br>🗺 <a href="${esc(o.map_link)}" target="_blank" rel="noopener">فتح الموقع</a>`:""}`:`🏪 استلام: ${esc(o.branch)} (${esc(o.pickup_time)})`}</p>
 ${o.items.map(l=>`<div class="ci"><div class="row"><b dir="ltr">${esc(l.name)} × ${l.qty}</b><span>${sar(l.unit*l.qty)}</span></div><small>${(l.opts||[]).map(esc).join(" · ")}</small></div>`).join("")}
 <div class="row"><span>المجموع</span><span>${sar(o.subtotal)}</span></div>${Number(o.delivery_fee)?`<div class="row"><span>التوصيل</span><span>${sar(o.delivery_fee)}</span></div>`:""}
 <div class="row"><b>الإجمالي</b><b>${sar(o.total)}</b></div>
 ${o.moyasar_payment_id?`<small dir="ltr">Payment: ${esc(o.moyasar_payment_id)}</small>`:""}
 <label>ملاحظات داخلية<textarea id="notes" rows="2" maxlength="500">${esc(o.notes||"")}</textarea></label><button class="btn ghost" id="saveNotes">حفظ الملاحظة</button>
 <div class="stbtns">${Object.entries(STATUS).filter(([k])=>o.type==="delivery"||k!=="out_for_delivery").map(([k,v])=>`<button class="btn ${k==="cancelled"?"":"g"} ${o.status===k?"cur":""}" data-st="${k}">${v}</button>`).join("")}</div>
 <div class="err" id="dErr"></div>`;
 $("#detail").classList.add("open");
}
async function update(id,patch){
 const {data,error}=await sb.from("orders").update(patch).eq("id",id).select().single();
 if(error){$("#dErr").textContent="تعذّر الحفظ: "+error.message;return}
 orders.set(id,data);render();
}
$("#list").onclick=e=>{const c=e.target.closest(".ord");if(c)showDetail(c.dataset.id)};
$("#detailSheet").onclick=e=>{const t=e.target;
 if(t.hasAttribute("data-close"))$("#detail").classList.remove("open");
 if(t.dataset.st){if(t.dataset.st==="cancelled"&&!confirm("إلغاء الطلب؟"))return;update($("#detail").dataset.id,{status:t.dataset.st})}
 if(t.id==="saveNotes")update($("#detail").dataset.id,{notes:$("#notes").value.trim()||null})};
$("#detail").onclick=e=>{if(e.target.id==="detail")e.target.classList.remove("open")};
$("#fDate").onchange=load;$("#fStatus").onchange=()=>render();$("#fPay").onchange=()=>render();
// ---- alerts ----
function primeAlerts(){
 try{audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();audioCtx.resume()}catch(e){}
 if("Notification" in window&&Notification.permission==="default")Notification.requestPermission();
}
$("#enableAlerts").onclick=()=>{primeAlerts();beep();$("#enableAlerts").textContent="🔔 التنبيهات مفعّلة"};
function beep(){if(!audioCtx)return;const t=audioCtx.currentTime;[0,.25,.5].forEach((d,i)=>{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.value=[880,1175,1568][i];g.gain.setValueAtTime(.0001,t+d);g.gain.exponentialRampToValueAtTime(.3,t+d+.02);g.gain.exponentialRampToValueAtTime(.0001,t+d+.22);o.connect(g).connect(audioCtx.destination);o.start(t+d);o.stop(t+d+.25)})}
function alertNew(o){
 beep();window.__vbAlerts=(window.__vbAlerts||0)+1;
 document.title="🔔 طلب جديد | Vanilla Bee";setTimeout(()=>document.title="لوحة الطلبات | Vanilla Bee",8000);
 if("Notification" in window&&Notification.permission==="granted"){
  try{const n=new Notification("طلب جديد "+o.order_no,{body:`${o.customer_name} · ${o.type==="delivery"?"توصيل":"استلام"} · ${sar(o.total)}`,tag:o.id});n.onclick=()=>{window.focus();showDetail(o.id)}}catch(e){}
 }
}
sb.auth.getSession().then(({data})=>{if(data.session)start()});
})();
