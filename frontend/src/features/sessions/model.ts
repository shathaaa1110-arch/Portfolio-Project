import { ApiError } from "@/shared/api/errors";
import type { CreateSessionInput } from "./api/create";

export const RIYADH = "Asia/Riyadh";
export const MAX_AHEAD_DAYS = 60;
const DAY = 86_400_000;

export function latinDigits(text: string): string {
  return text.replace(/[٠-٩]/g, n => String("٠١٢٣٤٥٦٧٨٩".indexOf(n)))
    .replace(/[۰-۹]/g, n => String("۰۱۲۳۴۵۶۷۸۹".indexOf(n)));
}

// Calendar dates are Riyadh dates even on a participant's phone in another time zone.
export function riyadhDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: RIYADH, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

export function sessionInput(name: string, date: string, time: string, district: string,
                             now = Date.now()): CreateSessionInput {
  const cleanName = name.trim();
  if (!cleanName || [...cleanName].length > 60) throw new Error("اكتب اسمًا للجلسة من حرف إلى ٦٠ حرفًا.");
  const clock = latinDigits(time.trim());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(clock)) {
    throw new Error("اختر يومًا ووقتًا صحيحين للجلسة.");
  }
  const starts_at = `${date}T${clock}:00+03:00`;
  const stamp = Date.parse(starts_at);
  if (!Number.isFinite(stamp) || riyadhDate(new Date(stamp)) !== date) throw new Error("اختر تاريخًا صحيحًا.");
  if (stamp < now) throw new Error("وقت الجلسة مضى؛ اختر موعدًا قادمًا.");
  if (stamp > now + MAX_AHEAD_DAYS * DAY) throw new Error("اختر موعدًا خلال الستين يومًا القادمة.");
  if (!district.trim()) throw new Error("اختر منطقة اللقاء قبل إنشاء الجلسة.");
  return { name: cleanName, starts_at, district };
}

export function sessionError(error: unknown): string {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      INVALID_START_TIME: "راجع الموعد؛ يجب أن يكون قادمًا وخلال ٦٠ يومًا.",
      UNKNOWN_DISTRICT: "هذا الحي غير متاح. اختر منطقة اللقاء من القائمة من جديد.",
      INVALID_TOKEN: "انتهت صلاحية دخولك. سجّل الدخول ثم أكمل.",
      TOKEN_EXPIRED: "انتهت صلاحية دخولك. سجّل الدخول ثم أكمل.",
      NOT_A_PARTICIPANT: "لا يمكنك فتح هذه الجلسة بهذا الحساب. ارجع إلى الدعوة.",
      OUTING_NOT_FOUND: "الجلسة غير موجودة. راجع رابط الدعوة.",
      ORGANIZER_ONLY: "هذا الإجراء متاح لمنظّم الجلسة فقط.",
      NOT_EVERYONE_READY: "ما اكتملت جاهزية الجميع بعد. نحدّث حالة المشاركين.",
      PREFERENCES_LOCKED: "بدأت مرحلة الاقتراحات، وأُغلق تعديل التفضيلات.",
      PREFERENCES_NOT_OPEN: "انتظر المنظّم حتى يفتح مرحلة التفضيلات.",
      INVALID_STATUS_TRANSITION: "تغيّرت مرحلة الجلسة. حدّث الصفحة للمتابعة.",
      PLAN_NOT_READY: "الاقتراحات لم تجهز بعد.",
    };
    return messages[error.code] ?? "تعذّر إكمال الطلب. بياناتك باقية؛ حاول مرة أخرى.";
  }
  return error instanceof Error ? error.message : "تعذّر إكمال الطلب. حاول مرة أخرى.";
}
