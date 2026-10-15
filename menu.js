// ===== المنيو: عدّل هنا فقط =====
// type: "drink" = مشروب بخيارات | "simple" = يضاف مباشرة بدون خيارات | "sweet" = حلى بدون خيارات
// خيارات اختيارية لكل صنف (لو ما انكتبت تُستخدم الإعدادات العامة تحت):
//   sizes:  [{name:"صغير",price:24},{name:"كبير",price:25}]  ← الحجم إجباري والسعر من الحجم
//   milks:  ["لاكتوز فري","شوفان"]   ← قائمة الحليب لهذا الصنف (الحليب إجباري للمشروبات)
//   addons: [{id:"x",name:"...",price:2}]  ← إضافات هذا الصنف فقط ([] = بدون إضافات)
//   sweetness:false / ice:false  ← إخفاء الحلا/الثلج
window.VB_MENU = {
  categories: [
    { id: "matcha", name: "ماتشا 🍵" },
    { id: "coffee", name: "قهوة ☕" },
    { id: "sweets", name: "حلويات 🍰" }
  ],
  items: [
    { id:"ivml", img:"assets/m-ivml.jpg?v=202610152206", cat:"matcha", type:"drink", name:"ICE VANILLA MATCHA LATTE", price:27, emoji:"🍵",
      desc:"آيس فانيلا ماتشا لاتيه بحليب الفانيلا وسيروب الفانيلا وفوم الفانيلا، واختر الحليب اللي تحبه" },
    { id:"veloura", img:"assets/m-veloura.jpg", cat:"matcha", type:"drink", name:"VELOURA MATCHA", price:28, emoji:"🥭",
      desc:"أجواء صيفية: ماتشا مانجو مثلجة بحليب المانجو وفوم المانجو وسيروب الفانيلا" },
    { id:"coconut", img:"assets/m-coconut.jpg", cat:"matcha", type:"drink", name:"COCONUT MATCHA", price:23, emoji:"🥥",
      desc:"حليب جوز الهند مع الماتشا وسيروب منكّه، ممزوجة في لاتيه ناعم ومنعش" },
    { id:"classic", img:"assets/m-classic.jpg", cat:"matcha", type:"drink", name:"CLASSIC MATCHA", price:24, emoji:"🍃",
      desc:"مزيج كلاسيكي من الماتشا والحليب بطعم ناعم وغني" },
    { id:"cinnabon", img:"assets/m-cinnabon.jpg?v=202610152206", cat:"matcha", type:"drink", name:"CINNABON MATCHA", nameAr:"سينابون ماتشا", price:24, emoji:"🍥",
      desc:"ماتشا ناعمة مع سيروب الفانيلا، تتوّجها فوم القرفة (سينابون) الكريمية",
      sizes:[{name:"صغير",price:24},{name:"كبير",price:25}],
      milks:["لاكتوز فري","شوفان","فانيلا"],
      addons:[{id:"mshot",name:"شوت ماتشا زيادة",price:2}],
      sweetness:false, ice:false },
    { id:"icev60", img:"assets/m-icev60.jpg", cat:"coffee", type:"simple", name:"ICE V60", price:18, emoji:"🧊", desc:"قهوة مقطرة باردة" },
    { id:"hotv60", img:"assets/m-hotv60.jpg", cat:"coffee", type:"simple", name:"V60 HOT", price:14, emoji:"☕", desc:"قهوة مقطرة حارة" },
    { id:"brownie", img:"assets/m-brownie.jpg", cat:"sweets", type:"sweet", name:"BROWNIE BITES", price:22, emoji:"🍫", desc:"قطع براونيز غنية بالشوكولاتة" },
    { id:"matilda", img:"assets/m-matilda.jpg", cat:"sweets", type:"sweet", name:"MATILDA CAKE", price:14, emoji:"🎂", desc:"كيكة ماتيلدا بالشوكولاتة" }
  ],
  milks: ["حليب الشوفان (Oat)","فانيلا برو (Vanilla Pro)","فانيلا عادي (Regular Vanilla)","حليب جوز الهند (Coconut)","حليب المانجو (Mango)","حليب الفراولة (Strawberry)","خالي اللاكتوز (Lactose-free)"],
  addons: [
    { id:"shot", img:"assets/m-shot.jpg", name:"شوت إضافي", price:4 },
    { id:"syrup", img:"assets/m-syrup.jpg", name:"سيروب إضافي", price:3 }
  ],
  sweetness: ["عادي","خفيف","بدون سكر","زيادة"],
  ice: ["عادي","خفيف","بدون ثلج","زيادة"]
};
