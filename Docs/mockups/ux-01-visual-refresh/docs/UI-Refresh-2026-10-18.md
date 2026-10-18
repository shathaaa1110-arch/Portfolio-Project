# ذوق — تسليم الواجهات المحدّث / Updated UI handoff

تقرير جديد مستقل لمهمة UX-01 #9، بتاريخ 18 أكتوبر 2026. لم يُعدّل التسليم السابق أو الصور الأصلية.

A separate delivery for [UX-01 #9](https://github.com/shathaaa1110-arch/Portfolio-Project/issues/9). The previous handoff and original mockups remain unchanged.

## ما تم تسليمه / What is included

- 16 شاشة من النطاق السابق، مع شاشة إضافية لمراجعة واعتماد التصويت = **17 شاشة**.
- A complete **17-screen** design set: 16 existing scope screens plus vote review.
- هوية الخيار الثاني: صور ممتدة، خلفية كريمية، أخضر داكن، خط عربي واضح، وأزرار مسمّاة.
- Selected option 2: immersive food photography, cream surfaces, forest green, Arabic type and labelled controls.
- نموذج تفاعلي للهاتف، ومسار ضيف متجاوب للمتصفح بعرض 375 و1440 بكسل.
- Interactive mobile preview and responsive guest browser flow, checked at 375px and 1440px.
- صور جديدة للشاشات وحالاتها، وشرح عربي وإنجليزي للحقول والأزرار والأخطاء والسلوك المطلوب.
- New screen/state exports and simple bilingual build notes.

## ما بقي ثابتًا / Approved behavior preserved

1. الحساب مطلوب للمنظّم، والتصفح والضيف بدون حساب. / Organizer account; public browsing and guest access.
2. الجلسات المباشرة، حتى 8 مشاركين. المجموعات المحفوظة والسياحة مؤجلة. / Direct sessions up to 8; persistent groups and tourism are deferred.
3. الجميع جاهز أولًا، ثم يبدأ المنظّم التوليد. تُغلق العضوية عند التوليد. / Everyone ready before organizer starts generation; membership then locks.
4. الحفظ قبل الانتقال للبطاقة التالية. الفشل يبقي البطاقة. / Save before advancing; failure keeps the card.
5. مراجعة الاختيارات ثم تأكيد الاكتمال. الأصوات الجزئية المحفوظة تدخل في الإنهاء المبكر. / Review marks completion; saved partial votes may count in early settlement.
6. حسم تلقائي عند اكتمال الجميع، مع إنهاء مبكر بتأكيد المنظّم. / Auto settle or confirmed organizer early end.
7. التأييد = الإعجابات ÷ جميع أعضاء الجولة؛ عدد من أكملوا منفصل. / Support = likes / all round members; completion count is separate.
8. التعادل الإيجابي بالترتيب المحفوظ. صفر إعجابات يعني لا فائز. / Stored ranking breaks positive ties; zero likes means no winner.
9. إعادة المحاولة في الجلسة نفسها، تحفظ الرابط والأشخاص والتفضيلات، وتصفر الأصوات والجاهزية في جولة جديدة. / Retry keeps session/link/people/preferences and resets readiness/votes in a new round.
10. الشروط الأساسية لا تُخفّف تلقائيًا ولا تُكشف تفاصيل الحساسية للآخرين. / Hard constraints are preserved and private details stay private.

## الملفات / Files

| الملف / File | الاستخدام / Use |
|---|---|
| [`source/public/handoff.html`](../source/public/handoff.html) | دليل مرئي لكل الشاشات / Visual screen guide |
| [`source/index.html`](../source/index.html) | نموذج الهاتف / Mobile prototype |
| [`source/public/guest-preview.html`](../source/public/guest-preview.html) | ضيف المتصفح / Responsive guest flow |
| [`source/public/exports/`](../source/public/exports/) | PNG للشاشات والحالات / Screen and state exports |
| [screen-specs.json](screen-specs.json) | حقول وأزرار وحالات كل شاشة / Structured screen specification |
| [design-tokens.json](design-tokens.json) | ألوان وخطوط ومسافات ومقاسات / Design tokens |
| [`source/src/Prototype.tsx`](../source/src/Prototype.tsx) | سلوك المعاينة / Prototype interaction source |
| [`source/src/prototype.css`](../source/src/prototype.css) | التصميم / Visual styles |
| [Frontend-Handoff.ar-en.md](Frontend-Handoff.ar-en.md) | شرح نقل التصميم للفرونت / Native implementation guidance |
| [Issue-Update.ar-en.md](Issue-Update.ar-en.md) | نص جاهز لتحديث التاسك / Ready issue update text |
| [design-qa.md](design-qa.md) | دليل التحقق وحدوده / QA evidence and scope |

## حدود التسليم / Delivery boundary

هذه **واجهات تصميم ونموذج ويب تفاعلي** جاهز للمراجعة والبناء عليه. ليست تطبيق Expo متصلًا بخادم، ولم يتم إنشاء حسابات أو إرسال SMS أو إشعارات أو بيانات حقيقية. إعادة تحميل المعاينة تصفر الذاكرة التجريبية. الحفظ الدائم، استعادة الضيف، والتحقق من البيانات والأذونات تبقى مسؤولية تنفيذ API والتطبيق الفعلي.

This is a **UI design and interactive web prototype** ready for review and frontend implementation. It is not a backend-connected Expo build. There is no real account creation, SMS, notification delivery or persistent session. Reload resets demo memory. Persistence, guest resume, data verification and authorization require real API/native integration.

الصور الثلاث صور طعام توضيحية، وليست صورًا موثقة للمطاعم المذكورة. في المنتج تستخدم صورًا مرخصة وموثقة، أو تصميمًا بدون صورة عند غيابها. النص داخل المنتج عربي، والإنجليزي للتسليم فقط.

The three food images are illustrative, not verified photos of the named restaurants. Production must use licensed verified photography or a no-photo treatment. Product copy is Arabic; English belongs to the handoff.

## حالة التسليم / Delivery status

جاهز لمراجعة التصميم وبناء الفرونت، في إضافة مستقلة داخل `Docs/mockups/ux-01-visual-refresh/`. تبقى UX-01 مفتوحة حتى المراجعة والدمج. روابط طلب الدمج والتسليم المنشور موثّقة في [الإيشيو](https://github.com/shathaaa1110-arch/Portfolio-Project/issues/9).

Ready for design review and frontend implementation, delivered separately in `Docs/mockups/ux-01-visual-refresh/`. UX-01 remains open for review and merge. The issue records the published delivery and pull request links.

## ترتيب الملفات / Repository layout

- `source/`: كود المعاينة ومكتباته؛ `source/public/exports/` يضم الصور الـ٥٢. / Runnable prototype; its public exports folder contains all 52 images.
- `docs/`: التقرير الجديد، مواصفات الشاشات، دليل التنفيذ، الألوان والمقاسات، ودليل التحقق. / New report, screen specs, implementation guide, tokens and QA.
- `evidence/`: لوحات المقارنة وقياسات المعاينة. / Comparison boards and capture measurements.

لا تُكرر نسخة البناء داخل الريبو؛ ينتجها `npm run build`. استُبدل رابط المقارنة المحلي برابط التسليم السابق في GitHub ليعمل لدى بقية الفريق. لم تتغير واجهات API أو قاعدة البيانات أو ERD أو تطبيق `frontend/` بهذه الإضافة.

Build output is produced by `npm run build` rather than duplicated in the repository. The previous-handoff comparison link now opens its GitHub document for the whole team. This addition changes no API, database, ERD or `frontend/` application behavior.
