# طريقة استخدام أداة الطلبات

كل طلبات الباك تمر من دالة وحدة في ملف الأداة.

```ts
import { request } from "@/shared/api/client";
```

## 1. الإعداد
انسخ ملف الإعدادات المثال إلى ملفك الخاص، وخلّ الوضع التجريبي مفعّل لين يجهز الخادم.

```
copy .env.example → .env.local
EXPO_PUBLIC_USE_MOCK=true
```

## 2. طلب بدون تسجيل دخول
مثل قراءة المطاعم العامة.

```ts
const restaurants = await request("GET", "/restaurants");
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
registerMock("GET", "/restaurants", () => [{ id: "1", name: "Test" }]);
```