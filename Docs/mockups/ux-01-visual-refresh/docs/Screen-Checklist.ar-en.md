# الشاشات المطلوبة / Required screens

تسليم منفصل لـ UX-01. الواجهة عربية، والملاحظات باللغتين. / Separate UX-01 UI delivery.

## 02-sign-up — حساب المنظم / Organizer account

Preview: `?screen=signup` · Export: `exports/02-sign-up.png`

### الحقول / Fields

- الاسم: مطلوب، دون فراغات زائدة؛ وليس «اسم الجلسة». / Name: required, trimmed; never call it Session name.
- رقم الجوال: حقل واحد بصيغة 05XXXXXXXX؛ اقبل الأرقام العربية ووحّدها في الخادم. / Phone: one input, 05XXXXXXXX; accept Arabic digits and normalize on the server.

### الأزرار / Actions

- إرسال رمز التحقق ← التحقق؛ لدي حساب ← دخول بالهاتف؛ رجوع ← التصفح العام. / Send code → verification; Existing account → phone login; Back → public browsing.

### الحالات / States

- الفراغ أو الصيغة الخاطئة: رسالة عند الحقل بعد الإرسال. أثناء الإرسال: امنع تكرار الطلب. / Empty/invalid fields: show an inline message after submit. Sending: disable a second request.
- فشل الإرسال: احفظ المدخلات وأظهر «إعادة المحاولة». لا يعتبر الحساب منشأ قبل نجاح التحقق. / Delivery failure: keep entered values and offer Retry. Account creation succeeds only after verification.

### ملاحظات / Notes

- الحساب مطلوب للمنظم فقط؛ يبقى التصفح وضيف المتصفح متاحين. / Only the organizer needs an account; browsing and browser guests stay accessible.
- الدخول يستخدم حقل الهاتف نفسه دون طلب الاسم مرة أخرى. / Login uses the same phone field without asking for the name again.

## 03-verification — تأكيد رقم الجوال / Verify phone

Preview: `?screen=verify` · Export: `exports/03-verification.png`

### الحقول / Fields

- الرمز: حقل رقمي واحد قابل للوصول؛ طوله يأتي من مزود SMS وعقد API. / Code: one accessible numeric input; length comes from the SMS provider/API contract.
- اعرض رقم الجوال المرسل إليه بشكل مخفي جزئيًا وباتجاه يسار إلى يمين. / Show a masked destination phone number in LTR order.

### الأزرار / Actions

- تحقق ومتابعة؛ تعديل الرقم؛ إعادة الإرسال بعد انتهاء مهلة الخادم. / Verify and continue; Change phone; Resend when the server cooldown ends.

### الحالات / States

- رمز خاطئ أو منتهٍ: وضح الخطوة التالية. حد المحاولات: اعرض وقت إعادة المحاولة من الخادم. / Wrong/expired code: explain next step. Rate limit: show server retry time.
- اسمح بالملء واللصق الكاملين؛ لا تعرض نجاح الدخول قبل تحقق الخادم. / Auto-fill/paste complete code; never show a successful login before server verification.

### ملاحظات / Notes

- المربعات الأربعة وعدّاد ٤٥ ثانية في الصورة القديمة ليسا متطلبًا ثابتًا. / The four boxes and 45-second countdown in the old image are not a fixed requirement.
- أعد المستخدم إلى إنشاء الجلسة التي بدأها بعد نجاح الدخول. / Return to the intended Create session action after successful login.

## 05-account-preferences — تفضيلات الحساب / Saved account preferences

Preview: `?screen=defaults` · Export: `exports/05-account-preferences.png`

### الحقول / Fields

- المطابخ المفضلة: اختيار متعدد اختياري، مع «لا أفضل مطبخًا معينًا». / Cuisine likes: optional multi-select, with No preference.
- الميزانية والمسافة والحساسية أو القيود واحتياجات الجلسة الافتراضية تستخدم حقول تفضيلات الجلسة نفسها. / Default budget, distance, allergies/restrictions and seating needs use the same fields as session preferences.

### الأزرار / Actions

- حفظ التفضيلات؛ التخطي الآن؛ التعديل من حسابي. / Save defaults; Skip for now; Edit from My account.

### الحالات / States

- جارٍ الحفظ أو تم أو فشل: احفظ التعديل وأتح إعادة المحاولة. الجلسة الجديدة تنسخ التفضيلات ولا تتغير جلسة موجودة تلقائيًا. / Saving/saved/failed: keep edits and show retry. New session copies defaults; an existing session does not silently change.

### ملاحظات / Notes

- النص: «هذه تفضيلات للجلسات الجديدة. تعديل جلسة لا يغيّر تفضيلات حسابك». / Copy: These are defaults for new sessions. Editing a session does not change your account.
- لا تشترط حفظ الملف قبل التصفح. / Do not require saving a profile before browsing.

## 06-browse — تصفح المطاعم / Public restaurant browsing

Preview: `?screen=browse` · Export: `exports/06-browse.png`

### الحقول / Fields

- البحث باسم المطعم؛ تصفية المطبخ والسعر. لا يتطلب حسابًا. / Search restaurant name; cuisine and price filters. No account required.
- المطعم: الاسم والمطبخ والسعر المتوفر والحقول الموثقة فقط. / Restaurant: name, cuisine, available price, verified fields only.

### الأزرار / Actions

- إنشاء جلسة ← دخول عند الحاجة؛ الانضمام برمز؛ تفاصيل المطعم؛ حسابي. / Create session → sign in if needed; Join by code; Open restaurant details; Account.

### الحالات / States

- تحميل القائمة؛ لا نتائج مع «مسح الفلاتر»؛ فشل التحميل مع «إعادة المحاولة». / Loading list; no search results with Clear filters; failed load with Retry.
- دون منطقة لقاء: لا تعرض مسافة. عند غياب التقييم أو الساعات: «غير متوفر» دون اختلاق قيم. / No meeting area yet: omit distance. Missing rating/hours: say Not available, never invent values.

### ملاحظات / Notes

- التصفح العام ليس ترشيحًا شخصيًا ولا يدعي ملاءمة الحساسية. / Public browsing is not a personalized recommendation and does not claim allergy suitability.
- واجهة المنتج عربية في هذه النسخة؛ الملاحظات الإنجليزية لشرح التنفيذ. / Arabic-only product copy in this release; English notes explain implementation.

## 07-create-session — إنشاء جلسة مباشرة / Create a direct session

Preview: `?screen=create` · Export: `exports/07-create-session.png`

### الحقول / Fields

- اسم الجلسة والتاريخ والوقت (الرياض) ومنطقة اللقاء حقول مطلوبة. / Session name, date, time (Riyadh), and meeting area are required.
- منطقة اللقاء تختار يدويًا؛ لا تشترط إذن الموقع الشخصي. / Meeting area is selected manually; no personal GPS permission required.

### الأزرار / Actions

- إنشاء الجلسة ← غرفة الانتظار ورمز ورابط المشاركة. / Create session → waiting room and shareable code/link.

### الحالات / States

- أخطاء الحقول تظهر بجانبها؛ الضغط المتكرر لا ينشئ جلسة ثانية. / Field errors stay beside fields; duplicate tap cannot create a second session.
- فشل الطلب: احفظ القيم؛ انتهاء الدخول: أعد الدخول ثم استأنف بأمان. / Request failed: preserve values; authentication expired: sign in and resume safely.

### ملاحظات / Notes

- جلسة واحدة حتى ثمانية مشاركين بمن فيهم المنظم؛ المجموعات المحفوظة مؤجلة. / One session, up to eight participants including organizer. Saved groups are deferred.
- وحّد مصطلح «الجلسة» واستبدل به «القروب». / Use the same session terms throughout; replace Group with Session.

## 08-join — الانضمام إلى جلسة / Join a session

Preview: `?screen=join` · Export: `exports/08-join.png`

### الحقول / Fields

- رمز الدعوة: حقل واحد باتجاه يسار إلى يمين وحروف كبيرة؛ يملؤه الرابط تلقائيًا. / Invite code: one LTR uppercase input, prefilled by invite link.
- اسم الضيف: مطلوب؛ لا هاتف ولا رمز تحقق ولا حساب. لا تعرض معاينة الجلسة والمنظم إلا بعد تحقق رابط الدعوة. / Guest display name: required; no phone, OTP, or account. Show organizer/session preview only after valid invite lookup.

### الأزرار / Actions

- انضمام ← الانتظار؛ تغيير الرمز؛ إعادة البحث. / Join → waiting room; Change code; Retry lookup.

### الحالات / States

- دعوة غير صحيحة؛ الجلسة ممتلئة (٨/٨)؛ الانضمام مغلق؛ الوصول ملغى؛ الاتصال منقطع. لكل منها رسالة مختلفة. / Invalid invite; full (8/8); joining closed; removed access; connection lost. Each has a distinct message.
- يغلق الانضمام عند بدء توليد الاقتراحات. تكرار الانضمام أو التحديث يعيد المشارك نفسه. / Joining closes when suggestion generation begins. Repeated join/reload resumes the same participant.

### ملاحظات / Notes

- الرمز من أربع خانات في التصميم الحالي ويؤكد عقد P-02 صيغته. لا تعكس ترتيب حروفه في العربية. / Four-character code is the current design; confirm server format in P-02. Do not reverse code characters in RTL.
- متصفح الضيف يستخدم النموذج نفسه؛ لا تعيق الانضمام دعوة تثبيت التطبيق. / Guest browser uses this same form; no install banner blocks joining.

## 09-waiting-room — المشاركون والجاهزية / Participants and readiness

Preview: `?screen=lobby` · Export: `exports/09-waiting-room.png`

### الحقول / Fields

- رمز الجلسة واسمها ووقتها ومنطقتها وعدد المشاركين والجاهزين. / Session code, name, time, area, total participants and ready count.
- الصفوف تعرض الاسم وشارة المنظم والجاهزية فقط؛ دون القيود الشخصية. / Rows show only display name, organizer badge, and readiness. No personal constraints.

### الأزرار / Actions

- للجميع: تفضيلاتي. للمنظم: مشاركة الدعوة وإزالة مشارك آخر وتوليد الاقتراحات عندما يجهز الجميع. / Everyone: My preferences. Organizer: Share invite, remove another participant, Generate suggestions when everyone is ready.
- للمشارك: المغادرة قبل التوليد بعد التأكيد. لا إزالة للمنظم نفسه ولا نقل ملكية ضمن هذا النطاق. / Participant: Leave before generation, after confirmation. No organizer self-removal/ownership transfer in this scope.

### الحالات / States

- جاهزون ٣ من ٤: التوليد معطل مع السبب. جاهزون ٤ من ٤: يمكن للمنظم التوليد. / 3 of 4 ready: generation disabled with reason. 4 of 4 ready: organizer can generate.
- بدء التوليد: يقفل الانضمام والمغادرة والإزالة. وصول شخص أو تعديل تفضيل يحدث الجاهزية قبل التوليد. / Generation started: joining/leaving/removal lock. New arrival or preference edit updates readiness before generation.

### ملاحظات / Notes

- لا تولد تلقائيًا عند جاهزية آخر شخص؛ يبدأ المنظم بعد جاهزية الجميع. / Do not generate automatically on the last Ready. Organizer starts after everyone is ready.
- الجاهزية ليست حضورًا ولا مجرد فتح الشاشة. / Ready is not attendance and not simply opening the screen.

## 10-session-preferences — تفضيلات الجلسة الخاصة / Private session preferences

Preview: `?screen=preferences` · Export: `exports/10-session-preferences.png`

### الحقول / Fields

- المطابخ اختيارية. حد أدنى وأقصى للميزانية بالريال للشخص وحد المسافة بالكيلومتر من منطقة اللقاء. / Cuisine likes optional. Budget min/max in SAR per person, distance limit in km from the meeting area.
- الحساسية أو القيود: «لا يوجد» أو اختيارات صريحة؛ احتياجات الجلسة: «لا اشتراط» أو اختيارات. غياب الإجابة لا يعني «لا يوجد». / Allergies/restrictions: None or explicit selections; seating needs: No requirement or selections. No answer is not None.

### الأزرار / Actions

- احفظ وأعلن الجاهزية بعد حفظ قيم صحيحة فقط. التعديل يلغي الجاهزية حتى الحفظ وإعلانها مجددًا. / Save and mark ready only after valid values are saved. Edit answers clears readiness until saved and marked ready again.

### الحالات / States

- التحقق: الأدنى لا يتجاوز الأعلى، والمسافة موجبة، والإجابات المطلوبة مكتملة. فشل الحفظ يبقي النموذج ولا يعلن الجاهزية. / Validation: minimum ≤ maximum, positive distance, required answers complete. Save failure keeps the form and never marks Ready.
- بعد التوليد: للقراءة فقط. الإعادة تبقي القيم وتلغي جاهزية جميع المشاركين. / After generation: read only. Retry carries values forward but resets every participant to not ready.

### ملاحظات / Notes

- النص: «نستخدم شروطك لاستبعاد الاقتراحات غير المناسبة، ولا نعرض تفاصيلها لبقية المشاركين». / Copy: Your constraints are used to filter suggestions. They are not shown to the other participants.
- لا تعرض حساسية منسوبة لشخص أو قائمة مسببات مجهولة الأسماء أو من تسبب بعدم التطابق. نقص حقيقة شرط أساسي يستبعد المطعم. / Never expose a named allergy, anonymous allergen list, or who caused a no-match result. Unknown hard-limit facts exclude the restaurant.

## 20-generating — توليد الاقتراحات / Generate suggestions

Preview: `?screen=generating` · Export: `exports/20-generating.png`

### الحقول / Fields

- اعرض الجلسة الحالية ورسالة محايدة: «نجمع الاقتراحات المناسبة». / Show the current session and a neutral Generating message.

### الأزرار / Actions

- انتظر نتيجة الخادم وأعد الطلب الفاشل بأمان دون إنشاء جولة مكررة. / Wait for server result; retry a failed request safely without starting a duplicate round.

### الحالات / States

- نجاح ← التصويت. قائمة فارغة ← لا اقتراحات. فشل ← خطأ اتصال مع إعادة المحاولة. / Success → vote. Empty result → no-match screen. Failure → connection error with Retry.
- الخادم هو المرجع؛ بعد عودة الاتصال حمّل الجلسة والجولة الحالية. / The server is the source of truth. After reconnect, load the current session/round.

### ملاحظات / Notes

- لا تفاصيل شخصية في رسائل التحميل؛ تبقى عضوية الجولة ثابتة. / No personal details in loading messages; all round members remain locked.
- لا تشترط ثلاثة اقتراحات إذا تأهل أقل؛ لا تكمل العدد باقتراحات غير موثقة. / Do not require exactly three suggestions when fewer qualify. Never pad with unverified matches.

## 11-voting — التصويت على الاقتراحات / Vote on suggestions

Preview: `?screen=vote` · Export: `exports/11-voting.png`

### الحقول / Fields

- اسم المطعم والمطبخ والسعر المتوفر والمسافة المباشرة من اللقاء وسبب الترشيح. / Restaurant name, cuisine, available price, straight-line km from meeting area, recommendation reason.
- اعرض رقم البطاقة من العدد الفعلي وإجابتك المحفوظة. درجة الترشيح إن ظهرت تسمى بوضوح ولا تخلط بتأييد المجموعة. / Show card x of actual n and your saved answer. Recommendation score, if shown, must be labelled separately from group support.

### الأزرار / Actions

- يعجبني / أتخطّى يحفظ الإجابة ثم ينتقل بعد النجاح فقط. التفاصيل تعود للبطاقة نفسها. التراجع يعيد آخر اختيار. بعد إجابة كل البطاقات افتح المراجعة. / Like / Pass saves the current answer, then advances only after success. Details returns to the same card. Undo restores the last saved answer. After every card is answered, open Review.

### الحالات / States

- فشل الحفظ: أبق البطاقة وأتح الإعادة؛ لا تنتقل أو تحتسب صوتًا غير محفوظ. انتهت الجولة: اعرض النتيجة. / Save failure: keep the card and offer retry; do not advance/count an unsaved vote. Session closed: show result.

### ملاحظات / Notes

- الأزرار تكفي؛ السحب اختياري ولا يكون الطريقة الوحيدة للتصويت. / Buttons are sufficient; swiping is optional and must not be the only way to vote.
- لا تعرض تفاصيل الحساسية الخاصة. التقييم أو الساعات الاختيارية الناقصة «غير متوفرة». لا ادعاء بضمان السلامة. / Never display private allergy details. Missing optional rating/hours are shown as unavailable. No guaranteed-safe claim.
- لا تضع نسبة توافق أو خوارزمية ترتيب أخرى أو قيود شخص آخر الخاصة على البطاقة. / Do not use a match percentage, a second ranking algorithm, or another person’s private constraints on the card.

## 11b-vote-review — مراجعة واعتماد الاختيارات / Review and confirm votes

Preview: `?screen=review` · Export: `exports/11b-vote-review.png`

### الحقول / Fields

- كل اقتراح مع صورة مصغرة واسمه واختيارك المحفوظ: يعجبني / أتخطّى / لم تصوّت. عدد إعجاباتك. / Every suggestion with a thumbnail, name and your saved Like / Pass / Unanswered state. Count your likes.

### الأزرار / Actions

- تعديل صف ← بطاقته ← حفظ ← المراجعة. اعتماد ← نافذة تأكيد ← احتساب التصويت مكتملًا. الإلغاء يعود للمراجعة. / Edit a row → same voting card → save → return to Review. Confirm → confirmation sheet → mark voting complete. Cancel returns to review.

### الحالات / States

- الاعتماد معطل عند وجود اقتراح بلا إجابة أو طلب جارٍ. فشل الاعتماد يحفظ الاختيارات ويتيح الإعادة. الجولة المحسومة للقراءة وتفتح النتيجة الحالية. / Confirm disabled while any suggestion is unanswered or a request is pending. Failed confirmation keeps choices and offers retry. Settled round is read-only and opens the current result.

### ملاحظات / Notes

- الأصوات الفردية محفوظة قبل الاعتماد وقد تدخل في الحسم المبكر. الاعتماد يؤكد الاكتمال وليس أول إرسال للأصوات. لا تعرض اختيارات الآخرين. / Individual votes are already saved before confirmation; they may count if the organizer ends early. Confirmation marks completion, not first submission. Never show others’ choices.

## 12-vote-progress — تقدم التصويت / Voting progress

Preview: `?screen=progress` · Export: `exports/12-vote-progress.png`

### الحقول / Fields

- أكمل ٣ من ٥. يعرض الصف الاكتمال فقط؛ دون إعجابات فردية أو فائز مؤقت. / Completed: 3 of 5. Each row shows completion only; no individual likes or provisional winner.

### الأزرار / Actions

- للمشارك: مراجعة أصواتي أثناء فتح التصويت. للمنظم: إنهاء التصويت ← تأكيد. / Participant: Review my votes while voting is open. Organizer: End voting → confirmation.

### الحالات / States

- التأكيد: «أكمل ٣ من ٥ التصويت. ننهي الآن بالأصوات المسجلة؟» متابعة التصويت / إنهاء وعرض النتيجة. / Confirmation: 3 of 5 finished. End now using the recorded votes? Continue voting / End and show result.
- إكمال الجميع ← حسم تلقائي. طلبات الإنهاء المكررة تعيد النتيجة نفسها. / Everyone completed → automatic settlement. Duplicate end requests return the same result.

### ملاحظات / Notes

- لا مؤقت ولا تصويت تعادل؛ الإعجابات الإيجابية المتعادلة تحسم بترتيب الترشيح المحفوظ. / No timer or tie vote. Tied positive likes use stored recommendation order automatically.
- مقام التأييد يبقى كامل أعضاء الجولة الثابتين، بمن فيهم من لم يكمل. / The full locked membership remains the support denominator, including incomplete voters.

## 14-result — النتيجة وإعادة المحاولة / Result and retry

Preview: `?screen=result` · Export: `exports/14-result.png`

### الحقول / Fields

- مثال التأييد: ٣ إعجابات ÷ ٥ أعضاء للجولة = ٦٠٪. أكمل التصويت ٤ من ٥، ويعرض منفصلًا. / Support example: 3 likes / 5 round members = 60%. Completed voters: 4 of 5, shown separately.
- اسم الفائز وحقائقه المتوفرة؛ ملاحظة تعادل عند الحاجة: «حُسم بترتيب الترشيح بعد تساوي الإعجابات». / Winner name and available facts; optional tie note: Chosen by recommendation order after equal likes.

### الأزرار / Actions

- التفاصيل؛ فتح الخرائط عند توفر إحداثيات صحيحة؛ للمنظم: إعادة المحاولة في الجلسة نفسها. / Details; Open maps only with valid coordinates; Organizer: Try again in the same session.

### الحالات / States

- صفر إعجابات ← لا فائز. دون أصوات مسجلة ← نص عدم التصويت. لا تختَر أعلى ترشيح كفائز. / Zero likes → no winner. No recorded votes → no-votes wording. Do not select the top recommendation as a winner.
- تأكيد الإعادة يصفر الأصوات والجاهزية في جولة جديدة ويحفظ المشاركين والرابط والتفضيلات ثم يعود للإجابات. / Retry confirmation resets votes/readiness in a new round, keeps participants/link/preferences, then returns to answers.

### ملاحظات / Notes

- لا تقل «اتفق الجميع» عند ٦٠٪؛ عدم التصويت ليس عدم إعجاب. / Never say Everyone agreed at 60%; non-votes are not dislikes.
- الضيف يرى النتيجة وينتظر إعادة المنظم؛ لا يبدأ الإعادة بنفسه. / Guests see the result and wait for the organizer to retry; they cannot restart it.

## 15-details — تفاصيل المطعم / Restaurant details

Preview: `?screen=details` · Export: `exports/15-details.png`

### الحقول / Fields

- الاسم والمطبخ والسعر المتوفر والتقييم والساعات الموثقة والعنوان والإحداثيات إن توفرت. / Name, cuisine, available price, verified rating/hours, address, optional coordinates.
- سياق الجلسة يضيف سبب الترشيح والمسافة المباشرة. التفاصيل العامة لا تعني ملاءمة شخصية. / Session context adds the recommendation reason and straight-line distance. Public details do not imply personalized suitability.

### الأزرار / Actions

- رجوع للقائمة أو البطاقة السابقة؛ فتح الخرائط عند توفر الموقع. / Back to the originating list/card; Open in maps when location exists.

### الحالات / States

- السعر أو التقييم أو الساعات أو الموقع المفقود: «غير متوفر». دون إحداثيات: الخرائط غير متاحة مع توضيح. / Missing price/rating/hours/location: explicit Not available. No coordinates: maps action unavailable with explanation.
- خطأ تحميل: إعادة المحاولة؛ مطعم غير متاح: العودة للقائمة. / Load error: retry; removed restaurant: return to the list.

### ملاحظات / Notes

- لا تستخدم صورة طعام عامة كأنها دليل على المطعم. يكفي عرض معلوماتي دون صورة. / Do not substitute stock food photography as evidence of this restaurant. Data-free card treatment is acceptable.
- الترشيح يمرر الحقائق الأساسية الموثقة فقط؛ التصفح العام قد يعرض سجلات ناقصة مع توضيح النقص. / Only verified required facts pass recommendation filtering; public browsing may show incomplete records with missing fields explicit.

## 25-guest-browser — تخطيط متصفح الضيف / Guest browser layout

Preview: `?screen=guest` · Export: `exports/25-guest-browser.png`

### الحقول / Fields

- معاينة الجلسة ورمزها من الدعوة؛ اسمك الظاهر فقط. / Session preview and code from the invite; your display name only.
- كمبيوتر بعرض ٧٦٨ فأكثر: نموذج في الوسط بحد أقصى ٤٨٠؛ الهاتف: بعرض الشاشة وهوامش ٢٠. / Desktop ≥ 768px: centered form, max 480px; phone: full width with 20px sides.

### الأزرار / Actions

- انضم وأكمل بالمتصفح؛ بعدها تفضيلاتك والجاهزية والتصويت والنتيجة. لا يشترط تثبيت التطبيق. / Join and continue in browser; later: own preferences, Ready, vote and result. No app installation required.

### الحالات / States

- التحديث يعيد المشارك نفسه إذا بقي الوصول صالحًا. الوصول الملغى أو غير الصحيح يظهر رسالة دون كشف تفاصيل الجلسة. / Reload resumes the same participant if access remains valid. Removed/invalid access shows a clear message without leaking session details.
- انقطاع الاتصال: حالة «جارٍ استعادة الاتصال» واضحة؛ احفظ النموذج غير المرسل محليًا دون ادعاء حفظه بالخادم. / Connection lost: visible Reconnecting status; preserve unsent form locally, never fake a saved answer.

### ملاحظات / Notes

- استخدم ترتيب لوحة المفاتيح والتركيز المعتاد وعناوين الحقول. تتكيف الشاشات نفسها دون منتج ثانٍ. / Use native browser keyboard/focus order and labelled inputs. Same screens resize, not a second product.
- ضيف المتصفح يستقبل تحديثات داخل الصفحة؛ إشعارات المتصفح مؤجلة. / Browser guests receive in-page updates; browser push is deferred.

## 26-empty-retry — لا اقتراحات / لا فائز / No match / no winner

Preview: `?screen=empty` · Export: `exports/26-empty-retry.png`

### الحقول / Fields

- لا مطابقات: «لم نتمكن من التحقق من مطاعم تحقق الشروط الأساسية للجميع». / No matches: We could not verify restaurants that meet all essential conditions.
- لا إعجابات: «لم يحصل أي مطعم على إعجاب». لا أصوات: «انتهى التصويت دون أصوات مسجلة». / No likes: No restaurant received a like. No votes: Voting ended without recorded votes.

### الأزرار / Actions

- المنظم: مراجعة الإجابات وإعادة المحاولة. المشارك: انتظار المنظم. يبقى التصفح العام منفصلًا. / Organizer: Review answers and retry. Participant: Wait for organizer. Public browse remains separate.

### الحالات / States

- الإعادة تحفظ الرابط والأشخاص والتفضيلات وتنشئ جولة جديدة وتصفر الجاهزية والأصوات وتعيد فتح الانضمام قبل التوليد. / Retry keeps the same link/people/preferences, creates a new round, resets Ready/votes, and reopens joining before generation.
- لا تخفيف تلقائي للميزانية أو المسافة أو الحساسية؛ يعدّل كل شخص إجاباته بنفسه. / No silent budget/distance/allergy relaxation; only each person edits their own answers.

### ملاحظات / Notes

- دون فائز لا تعرض بطاقة فائز أو احتفالًا أو نسبة أو زر خرائط. / No winner card, celebratory copy, percentage, or maps CTA when there is no winner.
- اشرح نتيجة المجموعة دون كشف صاحب الشرط الخاص الذي استبعد المطعم. / Explain the group outcome without revealing whose private condition removed a restaurant.

## 27-notifications — إشعارات التطبيق / App notifications

Preview: `?screen=notifications` · Export: `exports/27-notifications.png`

### الحقول / Fields

- طلب الإذن بعد الانضمام أو الإنشاء: «ننبّهك عند بدء التصويت وظهور النتيجة». / Prompt after joining/creating: Notify me when voting starts and the result is ready.
- نص الإشعار يحتوي اسم الجلسة والحدث فقط؛ دون حساسية أو تفضيلات أو تفاصيل أصوات. / Notification text contains session name/event only; no allergy, preference or vote details.

### الأزرار / Actions

- السماح ← إذن iOS؛ ليس الآن ← متابعة. الضغط على الإشعار يفتح الجلسة والجولة الحالية المصرح بها. / Allow → iOS permission; Not now → continue. Notification tap opens the current authorized session/round.

### الحالات / States

- الإذن مرفوض: تستمر متابعة التصويت والنتيجة داخل التطبيق. إشعار قديم: حدّث الجولة الحالية. وصول ملغى: وضح انتهاء الوصول. / Denied: in-app progress/result still works. Stale notification: refresh current round. Removed access: explain access ended.

### ملاحظات / Notes

- فهد ينفذ الاستقبال وشذى تجهيز بناء iOS وعاصم إرسال الأحداث وحسن يتحقق من دليل الجهاز. / Fahad implements handling; Shatha owns iOS build setup; Asem sends events; Hassan verifies device evidence.
- هذا توصيف تصميم فقط. التسليم وفتح التطبيق المغلق يحتاجان نسخة تطوير أو تجربة فعلية على آيفون؛ لا يكفي Expo Go. / Design specification only. Delivery and closed-app routing need a real iPhone development/preview build, not Expo Go evidence.
