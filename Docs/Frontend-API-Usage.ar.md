# طريقة استخدام أداة الطلبات

كل طلبات الباك تمر من دالة وحدة في ملف الأداة.

```ts
import { request } from "@/shared/api/client";
```

## 1. الإعداد
انسخ ملف الإعدادات المثال إلى ملفك الخاص. للمطاعم والدخول الحقيقي استخدم `EXPO_PUBLIC_USE_MOCK=false`.
لتجربة ردود الحساب والتفضيلات المحلية فقط، فعّل `EXPO_PUBLIC_USE_MOCK=true` وأعد تشغيل Expo.
هذا الوضع لا يرسل SMS ولا يحفظ التفضيلات في قاعدة البيانات.

```
copy .env.example → .env.local
EXPO_PUBLIC_USE_MOCK=true
```

## 2. طلب بدون تسجيل دخول
مثل قراءة المطاعم العامة.

```ts
const { restaurants } = await request<{ restaurants: Restaurant[] }>("GET", "/restaurants");
```

## 3. طلب يحتاج تسجيل دخول
مرّر رمز الدخول مع الطلب.

```ts
const prefs = await request("GET", "/users/me/preferences", { token });
```

## 4. إرسال بيانات
حط البيانات مع الطلب.

```ts
await request("POST", "/auth/request-code", { body: { phone } });
```

## 5. الأخطاء
أي خطأ يرجع بنوع موحّد. لو ما فيه نت أو تأخر الرد ١٥ ثانية، يكون نوعه خطأ شبكة.

```ts
if (error.code === "NETWORK_ERROR") { /* show "check your connection" */ }
```

## 6. البيانات التجريبية
كل ميزة تسجّل ردودها التجريبية في ملف خاص فيها.

```ts
registerMock("GET", "/restaurants", () => ({
  restaurants: [{ id: 101, name_ar: "Test Restaurant", cuisines: ["italian"], price_tier: 3, rating: 4.6 }],
}));
```


## 7. تفضيلات الحساب

استدعاءات التفضيلات في `frontend/src/features/preferences/api.ts`:

```ts
const saved = await getAccountPreferences(token);
await saveAccountPreferences(token, payload);
```

تستخدم GET وPUT على `/users/me/preferences`. يمرر غلاف الحساب الرمز،
ويحوّل `model.ts` إجابات النموذج قبل الإرسال وبعد الاسترجاع.
لا ترسل `user_id` أو `is_saved` في طلب PUT.
راجع [العقد والتدفق والاختبارات](Preferences-Implementation.ar.md).
عند فحص ٢٨ أكتوبر ٢٠٢٦ لم يكن المسار منشورًا؛ عاد GET برمز 404.
