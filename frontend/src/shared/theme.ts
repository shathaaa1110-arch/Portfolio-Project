// القيم المشتركة لهوية واجهة التطبيق.
export const theme = {
   colors: {
    // Shared app colors.
    background: "#F8F6EF",
    surface: "#FFFDF8",
    text: "#193A30",
    border: "#D7DDCE",
    placeholder: "#7A826F",
    primary: "#194D3C",
    onPrimary: "#FFFEF9",

    // Search field background, hint, and icon.
    searchBackground: "#EDEEDE",
    searchText: "#6E7C5F",

    // Light accent for the session card.
    sessionAccent: "#DAE5C6",

    // Error messages in account screens.
    error: "#A54837",
  },

  opacity: {
    disabled: 0.43,
  },

  typography: {
    fontFamily: "IBMPlexSansArabic-Regular",
    fontFamilyBold: "IBMPlexSansArabic-Bold",
    titleSize: 31,
    // Use a smaller title inside a page.
    sectionTitleSize: 18,
        // Heading size inside the session card.
    sessionTitleSize: 21,
    bodySize: 14,
    labelSize: 13,
    inputSize: 16,
    buttonSize: 15,
  },

  spacing: {
    labelGap: 8,

    inputPaddingVertical: 12,
    inputPaddingHorizontal: 16,

    buttonPaddingVertical: 12,
    buttonPaddingHorizontal: 20,

    fieldGap: 20,
    actionGap: 12,
    pagePadding: 24,
    titleGap: 28,
    // Add space inside restaurant cards.
    cardPadding: 20,
  },

  sizes: {
    controlMinHeight: 54,
  },

  radii: {
    field: 15,
    button: 28,
    // Round restaurant card corners.
    card: 24,
  },

  borders: {
    control: 1,
  },
} as const;