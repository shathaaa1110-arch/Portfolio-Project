# UX-01 validation / دليل التحقق

Review date / تاريخ المراجعة: **2026-10-18**. Source: `a94d79da8d11a80073c95a6eb41eaa407a8c1ae6`.

## Completed / تم التحقق

| Check / الفحص | Evidence / الدليل |
|---|---|
| All 24 original mockups visually inspected and preserved byte-for-byte / فحص الأصول الـ٢٤ بصريًا وحفظها كما هي | [Source and export SHA-256 manifest](evidence/source-and-export-manifest.json); compared to `git show a94d79d:Docs/mockups/<file>`. |
| 16 revised boards contain Arabic + English fields/actions/states/rules / ١٦ لوحة تحتوي شرح الحقول والأزرار والحالات والقواعد باللغتين | `python3 Docs/mockups/ux-01/build.py` passes unique IDs, bilingual content, existing sources and exhaustive 24-image mapping. |
| 21 exported boards visually inspected / فحص صور اللوحات الـ٢١ | [Exports](exports/): 16 defaults + 5 changed error/confirmation/empty variants. Fonts, labels, original/revised correspondence, wrapping and action placement reviewed. |
| 51 visible states at 390px viewer width / ٥١ حالة بعرض ٣٩٠ | [DOM evidence](evidence/viewer-states-390.json): no page or phone-frame horizontal overflow, all phone frames RTL. State selections were made through the viewer controls. |
| 16 default screens at 320px viewer width / ١٦ شاشة بعرض ٣٢٠ | [DOM evidence](evidence/viewer-screens-320.json), [guest phone screenshot](evidence/guest-phone-320.jpg): no horizontal overflow. |
| Desktop guest variant / تخطيط الضيف على الكمبيوتر | [1280px screenshot](evidence/guest-desktop-1280.jpg), [size checks](evidence/desktop-layout-checks.json). Form reaches 480px at 768/1280px; fits available width at 320/390px. Fixed the initial narrow annotation column, then repeated these checks. |
| Viewer navigation / تنقل العارض | Screen/state selectors work. Keyboard Enter on Next advanced from guest to empty/retry; Previous returned to guest. This tests the viewer, not app forms. / الاختبار للعارض وليس للنموذج داخل التصميم. |
| JavaScript and browser output / جافاسكربت وسجل المتصفح | Extracted generated inline script passed `node --check`; browser error log empty at final check. |
| Approved behaviors trace to screens / ربط القرارات بالشاشات | [Screen table and flow](README.md): organizer-only generation/close/retry, all-ready gate, membership lock, private conditions, unknown-hard-fact exclusion, full-group denominator, auto tie handling, no winner without likes. |
| Existing code respected / مراعاة الموجود | Signup label already **الاسم** in source; documented as already fixed. No duplicate app change. Original postponed images are references only. |

The current implementation files, API routes, database and dependencies were not modified. App tests were not run because this change contains design documentation and a local viewer only. The affected flow diagram and documentation entry points were updated.

لم تتغير ملفات التطبيق أو نقاط API أو قاعدة البيانات أو الاعتماديات. لم تُشغّل اختبارات التطبيق لأن التغيير مستند تصميم وعارض محلي فقط. حُدّث رسم الرحلة وروابط الشرح المتأثرة.

## Limits / حدود الدليل

- These are static screen specifications. Buttons inside the illustrated frames do not submit, authenticate, vote, remove people, or send notifications. / هذه شاشات ثابتة؛ أزرارها لا تنفّذ دخولًا أو تصويتًا أو إزالة أو إشعارات.
- Browser sizing is a layout review, not a real iPhone/Safari/VoiceOver/Dynamic Type/keyboard-safe-area test. Those checks belong to frontend acceptance on actual builds. / مراجعة الأبعاد ليست اختبار آيفون فعلي أو قارئ شاشة أو تكبير خط أو مناطق لوحة المفاتيح؛ يلزم اختبارها في التنفيذ.
- SMS provider code length/expiry/resend policy and supported field values remain API/setup contracts; example values are not decisions. / طول رمز SMS وصلاحيته ومهلة الإرسال والقيم المدعومة تأتي من العقود التقنية، وليست الأرقام التوضيحية قرارات.
- Backend privacy, concurrent join/generate/vote, reconnection, push delivery with app closed, and vote arithmetic need integration tests after implementation. No claim of those passing is made here. / خصوصية الخادم والتزامن وإعادة الاتصال وإشعارات التطبيق المغلق والحسابات تحتاج فحص تكامل بعد التنفيذ؛ لم تُختبر هنا.
- P-01 is still open for full historical scope reconciliation. This design follows the approved decisions already written in that issue. / ما زالت P-01 مفتوحة لتوحيد الوثائق التاريخية بالكامل؛ يتبع التصميم القرارات المعتمدة المكتوبة فيها.

## Repeat the review / إعادة الفحص

1. Run `python3 Docs/mockups/ux-01/build.py` and inspect the generated `index.html`. / ابنِ العارض وافتحه.
2. Serve `Docs/mockups` locally using the command in [README](README.md). / شغّل العرض المحلي.
3. Select each changed screen/state, confirm Arabic order and all notes, then capture the full export view. / اختر الشاشة والحالة وافحص ترتيب العربية والشرح ثم صدّر اللوحة.
4. Test phone widths 320/390 and guest desktop widths 768/1280. / افحص الأبعاد المحددة للهاتف والكمبيوتر.
5. Ensure `git diff` shows no modified original PNGs, regenerate affected JPGs, and update the evidence manifest. / تأكد من بقاء الأصل وصدّر التغييرات وحدّث الدليل.
