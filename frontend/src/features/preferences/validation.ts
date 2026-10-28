// Convert Arabic and Persian digits for validation only.
function normalizeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .trim();
}

export function getBudgetError(minText: string, maxText: string): string {
  const min = normalizeDigits(minText);
  const max = normalizeDigits(maxText);

  // Empty fields mean no budget limits.
  if (!min && !max) return "";

  // Check only the limits that were entered.
  const enteredValues = [min, max].filter((value) => value !== "");

  if (enteredValues.some((value) => /^[-−]/.test(value))) {
    return "الميزانية ما تقبل أرقامًا سالبة.";
  }

  // Accept whole numbers, including zero.
  if (enteredValues.some((value) => !/^\d+$/.test(value))) {
    return "اكتب مبلغًا صحيحًا بالريال، بدون كسور أو حروف.";
  }

  // Respect the database integer range.
  const maxDatabaseInteger = 2_147_483_647;

  if (
    enteredValues.some((value) => {
      const amount = Number(value);

      return !Number.isSafeInteger(amount) || amount > maxDatabaseInteger;
    })
  ) {
    return "المبلغ كبير جدًا للحفظ. أدخل قيمة أصغر.";
  }

  // Compare the limits only when both are entered.
  if (min !== "" && max !== "" && Number(min) > Number(max)) {
    return "قيمة «إلى» لازم تساوي «من» أو تكون أكبر منها.";
  }

  return "";
}

// Check the optional distance in kilometres.
export function getDistanceError(value: string): string {
  const normalized = normalizeDigits(value).replace(/٫/g, ".");

  // An empty value means no distance limit.
  if (normalized === "") return "";

  // Accept whole numbers and decimal distances.
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return "اكتب مسافة بالكيلومتر، مثل 5 أو 2.5، بدون حروف أو إشارة سالب.";
  }

  const distance = Number(normalized);

  if (!Number.isFinite(distance)) {
    return "قيمة المسافة كبيرة جدًا. أدخل قيمة أصغر.";
  }

  if (distance <= 0) {
    return "المسافة لازم تكون أكبر من صفر.";
  }

  return "";
}