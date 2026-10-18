# Portfolio-Project
Group dining planner — collects everyone's preferences through one invite link and turns them into a restaurant the whole group agrees on.


## Core screen handoff / تسليم الشاشات الأساسية

[UX-01 — annotated screens and developer notes / الشاشات المشروحة وملاحظات التنفيذ](Docs/mockups/ux-01/README.md)

Includes original-to-revised comparisons, Arabic UI, bilingual rules, guest browser layouts, and [validation evidence](Docs/mockups/ux-01/VALIDATION.md). This is a design specification; it does not claim the app flow is implemented.

يشمل مقارنة الأصل بالتعديل ونصوصًا عربية وشرحًا باللغتين وتخطيط متصفح الضيف ودليل التحقق. هذه مواصفات تصميم ولا تعني اكتمال التطبيق.

## Frontend architecture / تنظيم الفرونت

[Arabic architecture and file ownership guide / شرح التقسيم وملفات شذى وفهد](Docs/Frontend-Architecture.ar.md) · [Run and check the app / التشغيل والفحص](frontend/README.md)

Expo routes live in `frontend/src/app`, composition in `src/application`, feature screens and behavior in `src/features`, and reusable UI/theme/tools in `src/shared`. The refactor extracts a temporary legacy sign-up form. This form is not the approved design: #21 will replace it with new account/login screens. The refactor does not implement real authentication, preferences or Home. The guide separates implemented files from the planned task map.

المسارات صغيرة، وكل ميزة تجمع شاشاتها ووظيفتها، والمكونات والهوية مشتركة. نُقلت شاشة التسجيل الأولية للتقسيم الجديد؛ ربط الحساب والتفضيلات والرئيسية يبقى في مهامه. الدليل يحدد مسؤول كل ملف ويشرح الموجود والمخطط بشكل منفصل.

After `npm --prefix frontend ci`, run `npm run check` from the repository root.
