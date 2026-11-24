export const introImages = {
  heila: require("../../../assets/images/onboarding/heila.webp"),
  saudi: require("../../../assets/images/onboarding/saudi.webp"),
  italian: require("../../../assets/images/onboarding/italian.webp"),
  wash: require("../../../assets/images/onboarding/wash.webp"),
  restaurant: require("../../../assets/images/sessions/restaurant-hero.webp"),
  invitation: require("../../../assets/images/sessions/invitation-paper.webp"),
};

export const introSteps = [
  {
    title: "ذوق يدلّك",
    image: require("../../../assets/images/onboarding/thouq-yadullak-logo.webp"),
    eyebrow: "هيلة معك، من أول اختيار",
    description: "ابحث عن مطعم أو مطبخ تحبّه،\nواكتشف خيارات تستاهل التجربة.",
  },
  {
    title: "نبدأ بذوقك",
    image: require("../../../assets/images/onboarding/nabda-bithoqak-title.webp"),
    eyebrow: "اختياراتك تصنع الفرق",
    description: "حدّد اللي تحبّه وميزانيتك والمسافة،\nعشان تكون الاقتراحات أقرب لك.",
  },
  {
    title: "من دعوة إلى جمعة",
    image: require("../../../assets/images/onboarding/invitation-to-gathering-title.webp"),
    eyebrow: "الجمعة أحلى مع بعض",
    description: "حدّد الموعد والمنطقة، وشارك الدعوة.\nبعد التفضيلات والجاهزية، تصوّتون وتظهر النتيجة.",
  },
] as const;
