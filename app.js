(function(){
const C=window.VB_CONFIG,M=window.VB_MENU,$=s=>document.querySelector(s);
const KEY="vb_cart";let cart=JSON.parse(localStorage.getItem(KEY)||"[]");let curCat=M.categories[0].id;
const sar=n=>n.toFixed(2).replace(/\.00$/,"")+" ر.س";
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const isTest=()=>!/^pk_(test|live)_/.test(C.moyasarPublishableKey||"");
function save(){localStorage.setItem(KEY,JSON.stringify(cart));$("#cartCount").textContent=cart.reduce((a,l)=>a+l.qty,0)}
function renderMenu(){
 $("#tabs").innerHTML=M.categories.map(c=>`<button data-c="${c.id}" class="${c.id===curCat?'on':''}">${esc(c.name)}</button>`).join("");
 $("#grid").innerHTML=M.items.filter(i=>i.cat===curCat).map(i=>`<div class="card"><img class="pimg" src="${i.img||"assets/hero.jpg"}" alt="${esc(i.name)}" loading="lazy"><h3>${esc(i.name)}</h3><p>${esc(i.desc)}</p><div class="row"><span class="price">${sar(i.price)}</span><button class="btn add" data-id="${i.id}">أضف</button></div></div>`).join("");
}
$("#tabs").onclick=e=>{if(e.target.dataset.c){curCat=e.target.dataset.c;renderMenu()}};
$("#grid").onclick=e=>{const id=e.target.dataset.id;if(id)openItem(M.items.find(i=>i.id===id))};
function radios(name,arr,checkFirst){return arr.map((v,k)=>`<label class="opt"><input type="radio" name="${name}" value="${esc(v)}" ${checkFirst&&k===0?'checked':''}> ${esc(v)}</label>`).join("")}
function openItem(it){
 const drink=it.type==="drink";
 $("#itemSheet").innerHTML=`<div class="row"><h3 style="direction:ltr">${esc(it.name)}</h3><button class="btn ghost" data-close>✕</button></div><p>${esc(it.desc)}</p>
 ${drink?`<fieldset id="milkSet"><legend>نوع الحليب <span class="req">* إجباري</span></legend>${radios("milk",M.milks,false)}<div class="err" id="milkErr"></div></fieldset>
 <fieldset><legend>إضافات (اختياري)</legend>${M.addons.map(a=>`<label class="opt"><input type="checkbox" name="addon" value="${a.id}"> ${esc(a.name)} (+${sar(a.price)})</label>`).join("")}</fieldset>
 <fieldset><legend>مستوى الحلا (اختياري)</legend>${radios("sweet",M.sweetness,true)}</fieldset>
 <fieldset><legend>كمية الثلج (اختياري)</legend>${radios("ice",M.ice,true)}</fieldset>`:""}
 <label>ملاحظات (اختياري)<textarea id="note" rows="2" maxlength="200"></textarea></label>
 <div class="row"><div class="qty"><button data-q="-1">−</button> <b id="q">1</b> <button data-q="1">+</button></div>
 <button class="btn g" id="addBtn" ${drink?'disabled':''}>أضف للسلة — <span id="lp"></span></button></div>`;
 let q=1;const sh=$("#itemSheet");
 const unit=()=>it.price+[...sh.querySelectorAll('[name=addon]:checked')].reduce((a,c)=>a+M.addons.find(x=>x.id===c.value).price,0);
 const upd=()=>{$("#q").textContent=q;$("#lp").textContent=sar(unit()*q);if(drink)$("#addBtn").disabled=!sh.querySelector('[name=milk]:checked')};
 sh.onchange=upd;
 sh.onclick=e=>{if(e.target.dataset.q){q=Math.max(1,q+ +e.target.dataset.q);upd()}if(e.target.hasAttribute("data-close"))close("#itemModal")};
 $("#addBtn").onclick=()=>{
  const opts=[];if(drink){const m=sh.querySelector('[name=milk]:checked');if(!m){$("#milkErr").textContent="لازم تختار نوع الحليب";return}
   opts.push("الحليب: "+m.value);sh.querySelectorAll('[name=addon]:checked').forEach(c=>opts.push(M.addons.find(x=>x.id===c.value).name));
   const s=sh.querySelector('[name=sweet]:checked').value,i=sh.querySelector('[name=ice]:checked').value;if(s!=="عادي")opts.push("الحلا: "+s);if(i!=="عادي")opts.push("الثلج: "+i)}
  const n=$("#note").value.trim();if(n)opts.push("ملاحظة: "+n);
  const key=it.id+"|"+opts.join("|");const ex=cart.find(l=>l.key===key);
  if(ex)ex.qty+=q;else cart.push({key,id:it.id,name:it.name,opts,unit:unit(),qty:q});save();close("#itemModal");toast("انضاف للسلة ✓")};
 upd();open("#itemModal");
}
function open(s){$(s).classList.add("open")}function close(s){$(s).classList.remove("open")}
document.querySelectorAll(".overlay").forEach(o=>o.addEventListener("click",e=>{if(e.target===o)close("#"+o.id)}));
function toast(t){const d=document.createElement("div");d.textContent=t;d.style.cssText="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#7fa36b;color:#fff;padding:10px 20px;border-radius:99px;z-index:99";document.body.appendChild(d);setTimeout(()=>d.remove(),1800)}
let mode="delivery",payMethod="online";
const subtotal=()=>cart.reduce((a,l)=>a+l.unit*l.qty,0);const total=()=>subtotal()+(mode==="delivery"?C.deliveryFee:0);
function renderCart(){
 const sh=$("#cartSheet");
 if(!cart.length){sh.innerHTML=`<div class="row"><h3>السلة</h3><button class="btn ghost" data-close>✕</button></div><p>السلة فاضية 🐝</p>`;return}
 sh.innerHTML=`<div class="row"><h3>السلة</h3><button class="btn ghost" data-close>✕</button></div>
 ${cart.map((l,k)=>`<div class="ci"><div class="row"><b style="direction:ltr">${esc(l.name)}</b><span>${sar(l.unit*l.qty)}</span></div><small>${l.opts.map(esc).join(" · ")}</small><div class="qty"><button data-d="${k}" data-v="-1">−</button> ${l.qty} <button data-d="${k}" data-v="1">+</button></div></div>`).join("")}
 <fieldset><legend>طريقة الاستلام</legend><label class="opt"><input type="radio" name="mode" value="delivery" ${mode==="delivery"?"checked":""}> توصيل (+${sar(C.deliveryFee)})</label><label class="opt"><input type="radio" name="mode" value="pickup" ${mode==="pickup"?"checked":""}> استلام من الفرع</label></fieldset>
 <form id="coForm" novalidate>
 <label>الاسم<input type="text" name="name" required></label><div class="err" data-e="name"></div>
 <label>رقم الجوال<input type="tel" name="phone" placeholder="05xxxxxxxx" required></label><div class="err" data-e="phone"></div>
 ${mode==="delivery"?`<label>الحي<input type="text" name="district"></label><div class="err" data-e="district"></div>
 <label>العنوان بالتفصيل<textarea name="address" rows="2"></textarea></label><div class="err" data-e="address"></div>
 <label>رابط الموقع (اختياري)<input type="text" name="map" placeholder="رابط Google Maps"></label><button type="button" class="btn ghost" id="geo">📍 استخدم موقعي</button>`
 :`<label>الفرع<select name="branch">${C.branches.map(b=>`<option>${esc(b.name)}</option>`).join("")}</select></label><label>وقت الاستلام<select name="time">${C.pickupTimes.map(t=>`<option>${esc(t)}</option>`).join("")}</select></label>`}
 </form>
 <div class="row"><span>المجموع</span><span>${sar(subtotal())}</span></div>${mode==="delivery"?`<div class="row"><span>التوصيل</span><span>${sar(C.deliveryFee)}</span></div>`:""}
 <div class="row"><b>الإجمالي</b><b id="total">${sar(total())}</b></div>
 <fieldset><legend>طريقة الدفع</legend><label class="opt"><input type="radio" name="paym" value="online" ${payMethod==="online"?"checked":""}> 💳 دفع إلكتروني</label>
 <div class="paybadges"><span> Apple Pay</span><span>mada</span><span>Visa</span><span>Mastercard</span></div>
 <label class="opt"><input type="radio" name="paym" value="cash" ${payMethod==="cash"?"checked":""}> 💵 كاش عند ${mode==="delivery"?"التوصيل":"الاستلام"}</label></fieldset>
 ${payMethod==="online"&&isTest()?`<div class="notice" id="testNotice">⚠️ وضع تجريبي: لم يتم إضافة مفتاح Moyasar بعد، لذلك الدفع غير مفعّل. أضف المفتاح في config.js.</div>`:""}
 <button class="btn g" id="payBtn" style="width:100%">${payMethod==="cash"?"تأكيد الطلب":"متابعة للدفع"}</button><div class="mysr-form" id="payForm"></div>`;
}
$("#cartSheet").onclick=e=>{const t=e.target;
 if(t.hasAttribute("data-close"))close("#cartModal");
 if(t.dataset.d!==undefined){const l=cart[+t.dataset.d];l.qty+= +t.dataset.v;if(l.qty<1)cart.splice(+t.dataset.d,1);save();renderCart()}
 if(t.id==="geo"&&navigator.geolocation)navigator.geolocation.getCurrentPosition(p=>{document.querySelector('[name=map]').value=`https://maps.google.com/?q=${p.coords.latitude},${p.coords.longitude}`});
 if(t.id==="payBtn")checkout()};
$("#cartSheet").onchange=e=>{if(e.target.name==="mode"){mode=e.target.value;renderCart()}if(e.target.name==="paym"){payMethod=e.target.value;renderCart()}};
$("#openCart").onclick=()=>{renderCart();open("#cartModal")};
function validate(){
 const f=$("#coForm"),d=Object.fromEntries(new FormData(f));let ok=true;f.parentNode.querySelectorAll(".err[data-e]").forEach(e=>e.textContent="");
 const err=(k,m)=>{ok=false;const e=document.querySelector(`[data-e=${k}]`);if(e)e.textContent=m};
 if(!d.name||d.name.trim().length<2)err("name","اكتب اسمك");
 if(!/^(05\d{8}|\+?9665\d{8})$/.test((d.phone||"").replace(/\s/g,"")))err("phone","رقم جوال سعودي غير صحيح");
 if(mode==="delivery"){if(!d.district||!d.district.trim())err("district","اكتب الحي");if(!d.address||d.address.trim().length<5)err("address","اكتب العنوان بالتفصيل")}
 return ok?d:null}
const hasDB=()=>/^https:\/\//.test(C.SUPABASE_URL||"")&&!/^PUT_/.test(C.SUPABASE_ANON_KEY||"");
const uuid=()=>crypto.randomUUID?crypto.randomUUID():"10000000-1000-4000-8000-100000000000".replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
async function saveOrder(row){
 const r=await fetch(C.SUPABASE_URL+"/rest/v1/orders",{method:"POST",headers:{apikey:C.SUPABASE_ANON_KEY,Authorization:"Bearer "+C.SUPABASE_ANON_KEY,"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify(row)});
 if(!r.ok)throw new Error("save "+r.status+" "+await r.text());
}
let busy=false;
async function checkout(){
 if(busy)return;const d=validate();if(!d)return;
 const n=new Date(),p2=x=>String(x).padStart(2,"0");
 const orderNo="VB"+p2(n.getMonth()+1)+p2(n.getDate())+"-"+Math.random().toString(36).slice(2,6).toUpperCase();
 const cash=payMethod==="cash";
 if(cash&&!hasDB()){$("#payForm").innerHTML='<div class="notice">الدفع كاش غير متاح حالياً.</div>';return}
 const order={uuid:uuid(),id:orderNo,mode,method:payMethod,customer:d,items:cart,subtotal:subtotal(),delivery:mode==="delivery"?C.deliveryFee:0,total:total(),at:n.toISOString()};
 const btn=$("#payBtn");
 if(hasDB()){
  busy=true;btn.disabled=true;btn.textContent="جاري حفظ الطلب...";
  try{await saveOrder({id:order.uuid,order_no:orderNo,customer_name:d.name.trim(),phone:d.phone.replace(/\s/g,""),type:mode,
   district:mode==="delivery"?d.district.trim():null,address:mode==="delivery"?d.address.trim():null,map_link:mode==="delivery"&&d.map?d.map.trim():null,
   branch:mode==="pickup"?d.branch:null,pickup_time:mode==="pickup"?d.time:null,
   items:cart.map(l=>({id:l.id,name:l.name,qty:l.qty,unit:l.unit,opts:l.opts})),subtotal:order.subtotal,delivery_fee:order.delivery,total:order.total,
   payment_method:cash?"cash":"online",payment_status:cash?"cash_pending":"pending"})}
  catch(e){console.error(e);busy=false;btn.disabled=false;btn.textContent=cash?"تأكيد الطلب":"متابعة للدفع";$("#payForm").innerHTML='<div class="notice" id="saveErr">تعذّر حفظ الطلب، تأكد من الاتصال وحاول مرة ثانية.</div>';return}
  busy=false;
 }
 localStorage.setItem("vb_last_order",JSON.stringify(order));
 btn.style.display="none";
 if(cash){location.href=`${C.callbackPath}?status=paid&method=cash`;return}
 if(isTest()){$("#payForm").innerHTML=`<div class="notice">وضع تجريبي: تم تجهيز الطلب ${order.id} بدون دفع فعلي.</div><a class="btn g" id="testFinish" href="${C.callbackPath}?test=1&status=paid&id=TEST">إتمام (تجريبي)</a>`;return}
 Moyasar.init({element:"#payForm",amount:Math.round(order.total*100),currency:"SAR",
  description:`Vanilla Bee order ${order.id}`,publishable_api_key:C.moyasarPublishableKey,
  callback_url:new URL(C.callbackPath,location.href).href,methods:["creditcard","applepay"],
  supported_networks:["mada","visa","mastercard"],
  apple_pay:{country:"SA",label:C.storeName,validate_merchant_url:"https://api.moyasar.com/v1/applepay/initiate"},
  metadata:{order_id:order.uuid||order.id,order_no:order.id,phone:d.phone,mode}});
}
renderMenu();save();
})();
