// Keep each allergy choice connected to its illustration.
export const allergyOptions = [
  {
    id: "milk",
    label: "الحليب",
    image: require("../../../assets/images/preferences/allergies/milk.png"),
  },
  {
    id: "eggs",
    label: "البيض",
    image: require("../../../assets/images/preferences/allergies/eggs.png"),
  },
  {
    id: "tree_nuts",
    label: "المكسرات",
    image: require("../../../assets/images/preferences/allergies/tree-nuts.png"),
  },
  {
    id: "peanuts",
    label: "الفول السوداني",
    image: require("../../../assets/images/preferences/allergies/peanuts.png"),
  },
  {
    id: "fish",
    label: "السمك",
    image: require("../../../assets/images/preferences/allergies/fish.png"),
  },
  {
    id: "shellfish",
    label: "القشريات والمحار",
    image: require("../../../assets/images/preferences/allergies/shellfish.png"),
  },
  {
    id: "wheat",
    label: "القمح",
    image: require("../../../assets/images/preferences/allergies/wheat.png"),
  },
  {
    id: "soy",
    label: "الصويا",
    image: require("../../../assets/images/preferences/allergies/soy.png"),
  },
  {
    id: "other",
    label: "أخرى",
    // This choice will use a note icon.
    image: null,
  },
  {
    id: "sesame",
    label: "السمسم",
    image: require("../../../assets/images/preferences/allergies/sesame.png"),
  },
] as const;

// Allow only IDs from the choices above.
export type AllergyId = (typeof allergyOptions)[number]["id"];