// Preserve the current app appearance. Apply approved design changes here in UX-01/FE-28.
export const theme = {
  colors: {
    background: "whitesmoke",
    surface: "white",
    border: "lightgray",
    placeholder: "gray",
    primary: "darkgreen",
    onPrimary: "white",
    disabled: "gray",
  },
  typography: {
    // undefined keeps the platform's default font until a real font is loaded.
    fontFamily: undefined,
    titleSize: 28,
    labelSize: 20,
    bold: "bold",
  },
  spacing: {
    labelGap: 8,
    inputPadding: 14,
    buttonPadding: 15,
    fieldGap: 18,
    actionGap: 20,
    pagePadding: 24,
    titleGap: 28,
  },
  radii: { control: 20 },
  borders: { control: 2 },
} as const;
