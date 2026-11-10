import { ApiError } from "@/shared/api/errors";

export function preferencesErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "تعذّر إكمال الطلب. حاول مرة أخرى.";
  if (error.status === 401) return "انتهت جلسة الدخول. سجّل دخولك مجددًا.";
  if (error.status === 404 || error.status === 501) return "خدمة التفضيلات غير متاحة حاليًا. تقدر ترجع للتصفح وتحاول لاحقًا.";
  if (error.status === 422) {
    const labels: Record<string, string> = {
      liked_cuisines: "المطابخ وأنواع الأكل", allergies: "الحساسية",
      budget_min: "أقل ميزانية", budget_max: "أعلى ميزانية",
      max_distance_km: "المسافة", seating_needs: "احتياجات الجلسة",
    };
    const fields = Array.isArray(error.fields) ? [...new Set(error.fields
      .filter((field): field is string => typeof field === "string")
      .map(field => labels[field.replace(/^body\./, "").split(".")[0]])
      .filter(Boolean))] : [];
    return fields.length ? `راجع هذه القيم: ${fields.join("، ")}.`
      : "راجع قيم التفضيلات؛ بعض البيانات لم يقبلها الخادم.";
  }
  if (error.status === 503) return "خدمة التفضيلات غير متاحة مؤقتًا. حاول مرة أخرى.";
  if (error.code === "NETWORK_ERROR") return "تعذّر الاتصال بالخادم. حاول مرة أخرى.";
  return "تعذّر إكمال الطلب. حاول مرة أخرى.";
}
