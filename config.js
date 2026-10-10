// ===== إعدادات المتجر =====
window.VB_CONFIG = {
  storeName: "Vanilla Bee",
  currency: "SAR",
  deliveryFee: 15,            // رسوم التوصيل بالريال
  minOrder: 0,
  branches: [ { id: "main", name: "الفرع الرئيسي" } ],
  pickupTimes: ["أقرب وقت", "بعد 30 دقيقة", "بعد ساعة", "بعد ساعتين"],
  // >>> ضع هنا المفتاح العام (Publishable Key) من لوحة Moyasar <<<
  // يبدأ بـ pk_test_ للتجربة أو pk_live_ للتشغيل الفعلي
  moyasarPublishableKey: "PUT_YOUR_MOYASAR_PUBLISHABLE_KEY_HERE",
  callbackPath: "success.html"
};
