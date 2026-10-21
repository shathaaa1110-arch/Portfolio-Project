import { ApiError } from "@/shared/api/errors";

const DEFAULT_WAIT_SECONDS = 60;

// Arabic message for each backend error code the auth screens can receive
export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "صار خطأ، حاول مرة ثانية.";
  }
  switch (error.code) {
    case "INVALID_PHONE":
      return "اكتب رقم جوال صحيح يبدأ بـ 05.";
    case "INVALID_CODE":
      return "الرمز غير صحيح.";
    case "CODE_EXPIRED":
      return "انتهت صلاحية الرمز، اطلب رمزًا جديدًا.";
    case "TOO_MANY_ATTEMPTS":
      return "محاولات كثيرة، اطلب رمزًا جديدًا.";
    case "RATE_LIMITED":
      return `انتظر ${error.retryAfterSeconds ?? DEFAULT_WAIT_SECONDS} ثانية قبل طلب رمز جديد.`;
    case "SMS_SEND_FAILED":
      return "ما قدرنا نرسل الرمز، حاول مرة ثانية.";
    case "NETWORK_ERROR":
      return "تأكد من اتصالك بالإنترنت.";
    default:
      return "صار خطأ، حاول مرة ثانية.";
  }
}