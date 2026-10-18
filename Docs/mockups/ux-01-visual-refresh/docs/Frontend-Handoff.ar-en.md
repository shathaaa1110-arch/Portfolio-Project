# دليل بناء الفرونت / Frontend build guide

## ابدأ هنا / Start here

افتح `handoff.html` من المعاينة، واختر الشاشة. اقرأ الحقول ثم الأزرار ثم الحالات. روابط الحالات تعرض أمثلة الخطأ والانتظار. افتح `exports/` للصور، بما فيها الأجزاء السفلية للشاشات الطويلة.

Open the visual handoff, select a screen, then read Fields → Actions → States. Use the state links and PNG exports, including lower sections of long screens.

## طبقة الواجهة / UI layer

هذا الكود React للمتصفح. استخدمه مرجعًا للتصميم والتفاعل، ثم انقل المكونات إلى React Native. لا تنقل عناصر `div`, `button` أو CSS حرفيًا إلى تطبيق iOS.

The prototype is React DOM. Use it as a visual/interaction reference; map it to React Native primitives instead of copying DOM markup into iOS.

| مكوّن / Component | React Native / Expo | السلوك / Behavior |
|---|---|---|
| Screen shell | Safe area + Expo Router + ScrollView | Header stays fixed; content scrolls; bottom actions clear the home indicator. / عنوان ثابت وتمرير واضح ومساحة أمان. |
| Restaurant hero | expo-image + View | Full-width image; cream surface overlaps by 25pt; truthful optional facts. / صورة ممتدة وحقائق متاحة فقط. |
| Vote buttons | Pressable | ≥44pt; 54–57pt primary actions; label plus icon; disable during request. / اسم وأيقونة ومنع التكرار. |
| Chips | Pressable + selected state | Explicit None excludes conflicting options. / «لا يوجد» لا يجتمع مع قيود أخرى. |
| Forms | TextInput + keyboard handling | RTL labels; LTR phone/code; Arabic digits normalized by API. / عناوين عربية واتجاه مناسب للأرقام. |
| Confirmation | Accessible bottom sheet/modal | Explicit confirm/cancel; focus management; close keyboard before opening. / تأكيد وإلغاء وإدارة التركيز. |
| Glass header | expo-glass-effect + solid fallback | Platform support check; readable color; no glass dependency for core actions. / بديل واضح عند عدم الدعم. |
| Guest browser | Shared screen rules + responsive web | Max 480px on desktop; 20px phone margins; standard browser keyboard. / نفس السلوك مع تخطيط متجاوب. |

راجع توثيق النسخة نفسها قبل تنفيذ Native: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)، [Glass effect](https://docs.expo.dev/versions/v57.0.0/sdk/glass-effect/)، [Haptics](https://docs.expo.dev/versions/v57.0.0/sdk/haptics/). لا تضف اهتزازًا إلا بعد نجاح حفظ الاختيار. يمكن جعل الحركة بسيطة مع مراعاة Reduce Motion.

Use the exact SDK documentation above. Optional haptics should follow a successful save, with reduced-motion support for animations.

## الحالة والبيانات / State and data

- `sessionId` ثابت، و`roundId` يتغير عند الإعادة. خزّن عضوية الجولة عند بدء التوليد. / Stable session ID, new round ID per retry, membership snapshot at generation.
- لكل مطعم إجابة `like | pass | unanswered`. حالة اكتمال المشارك منفصلة. / Saved answer and participant completion are different states.
- اختيار بطاقة: احفظ بالخادم ثم انتقل. مراجعة: جميع البطاقات مجاب عنها ثم تأكيد الاكتمال. / Save each card, then confirm completion after review.
- تعديل اختيار بعد الاعتماد أثناء فتح الجولة يعيد حالة المشارك إلى غير مكتمل حتى يعيد الاعتماد. / Editing an open round clears completion until reconfirmed.
- عند حسم الخادم للجولة، امنع التعديل وافتح النتيجة الحالية. / Settled round is read-only; route to the authoritative result.
- لا تضع الحساسية أو الإجابات الخاصة في URL، سجل المتصفح، الإشعارات أو قائمة المشاركين. / Keep private values out of URLs, logs, notifications and participant rows.
- الطلبات المكررة للإنشاء والتوليد والحسم يجب أن تعيد نفس النتيجة. / Creation, generation and settlement need idempotent requests.
- ربط API، المصادقة والتحديثات المباشرة ليست منفذة في هذه المعاينة. / API, auth and realtime delivery are not implemented here.

## عقود مطلوبة من الباك / Backend handoff

هذه أسماء مفاهيم وحقول للتنسيق، **وليست مسارات API منفذة**. ثبّت الأسماء مع عاصم من العقد الفعلي في الريبو.

These are required concepts, **not implemented endpoints**. Agree exact names with the repository's API contract.

| المجال / Domain | البيانات المطلوبة / Required data |
|---|---|
| Auth | Normalized phone, verification status, OTP length, expiry, server retry-after |
| Session | ID, organizer, name, date/time/timezone, meeting area, phase, capacity, invite state |
| Membership | Participant ID, display name, role, ready, completed; no private answers |
| Private preferences | Cuisines, min/max budget, max distance, restrictions, seating needs, explicit-none flags |
| Suggestions | Round ID, stable restaurant ID, stored order, verified facts, photo provenance, missing facts |
| Votes | Participant ID, round ID, suggestion ID, answer, saved version, completion |
| Result | Winner or empty reason, likes, locked member count, completed count, tie explanation |
| Notification | Authorized session/round/event; refresh before navigating |

## شرح للمبتدئين / Beginner notes

الواجهة لا تقرر أن الحساسية آمنة ولا تحسب الفائز من بيانات ناقصة. هي تعرض حالة الخادم. في النموذج، زر «محاكاة اكتمال الجميع» خارج الهاتف أداة مراجعة فقط؛ لا يظهر للمستخدم في التطبيق.

The UI displays the server's decision. It must not certify allergy safety or invent a winner from missing data. Preview controls outside the phone simulate other participants and must not ship in the app.

وجود الملف لا يعني اكتمال الميزة. بعد الربط اختبروا على آيفون: لوحة المفاتيح، حجم النص، الرجوع، رفض الإشعارات، انقطاع الاتصال، وصول إشعار لجولة قديمة، ومحاولة تعديل بعد الحسم.

Files do not prove a feature is complete. After integration, test on iPhone: keyboard, larger text, navigation, denied notifications, offline recovery, stale notification routing and changes after settlement.

## ما لا يتغير بهذه الحزمة / Unchanged layers

قاعدة البيانات وERD ومسارات API الحالية لم تتغير؛ هذا تسليم واجهات فقط. عند تنفيذ الربط حدّثوا مخطط تدفق الجلسة، توثيق API المتأثر، وخريطة مكونات الفرونت ودليل المبتدئين في نفس التغيير. لا تعدّلوا الصور القديمة أو شرحًا مرتبطًا بمراجعة مصدر قديمة.

No database, ERD or existing API routes change in this UI delivery. Implementation should update the affected session flow, API contract, frontend component map and beginner guide together, while preserving old source provenance.
