// Keep the form steps in one place.
export const preferenceSteps = [
  {
    id: "cuisines",
    title: "أي مطبخ على ذوقك؟",
    description: "اختر المطابخ اللي تحبها، تقدر تختار أكثر من مطبخ.",
  },
  {
    id: "food",
    title: "وش نحط في صحنك؟",
    description: "اختر أنواع الأكل اللي تحبها، عشان نعرف ذوقك.",
  },
  {
    id: "seating",
    title: "وش الجلسة اللي تريحك؟",
    description: "اختر الأجواء اللي تناسبك، تقدر تختار أكثر من خيار.",
  },
  {
    id: "budget",
    title: "كم ميزانيتك للشخص؟",
    description: "حدّد المبلغ المناسب لك، أو اترك الميزانية بدون حد.",
  },
  {
    id: "distance",
    title: "وش أقصى مسافة تناسبك؟",
    description: "حدّد المسافة بالكيلومتر، أو اختر بدون حد للمسافة.",
  },
  {
    id: "allergies",
    title: "عندك حساسية من أكل معيّن؟",
    description: "حدّد حساسيتك، وأبلغ المطعم بها قبل الطلب.",
  },
] as const;