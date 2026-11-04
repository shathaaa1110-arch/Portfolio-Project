// These images represent a category, not the actual restaurant.
const images = {
  saudi: require("../../../assets/images/restaurant-categories/saudi.jpg"),
  levant: require("../../../assets/images/restaurant-categories/levant.jpg"),
  american: require("../../../assets/images/restaurant-categories/american.jpg"),
  italian: require("../../../assets/images/restaurant-categories/italian.jpg"),
  indian: require("../../../assets/images/restaurant-categories/indian.jpg"),
  asian: require("../../../assets/images/restaurant-categories/asian.jpg"),
  turkish: require("../../../assets/images/restaurant-categories/turkish.jpg"),
  egyptian: require("../../../assets/images/restaurant-categories/egyptian.jpg"),
  world: require("../../../assets/images/restaurant-categories/restaurant.jpg"),
  grills: require("../../../assets/images/restaurant-categories/grills.jpg"),
  sandwiches: require("../../../assets/images/restaurant-categories/sandwiches.jpg"),
  breakfast: require("../../../assets/images/restaurant-categories/breakfast.jpg"),
  seafood: require("../../../assets/images/restaurant-categories/seafood.jpg"),
  healthy: require("../../../assets/images/restaurant-categories/healthy.jpg"),
  coffee: require("../../../assets/images/restaurant-categories/cafe.jpg"),
  desserts: require("../../../assets/images/restaurant-categories/desserts.jpg"),
  bakery: require("../../../assets/images/restaurant-categories/bakery.jpg"),
  juices: require("../../../assets/images/restaurant-categories/juices.jpg"),
  fallback: require("../../../assets/images/restaurant-categories/restaurant.jpg"),
} as const;

// Aliases change presentation only; the backend keys stay unchanged.
const aliases: Record<string, keyof typeof images> = {
  healthy_salads: "healthy", specialty_coffee: "coffee", bakery_pastry: "bakery",
  japanese_sushi: "asian", filipino: "asian", shawarma: "sandwiches",
  ice_cream: "desserts", other: "fallback",
  saudi: "saudi", saudi_gulf: "saudi", gulf: "saudi", سعودي: "saudi",
  "سعودي وخليجي": "saudi", خليجي: "saudi",
  levant: "levant", levantine: "levant", lebanese: "levant", syrian: "levant", شامي: "levant",
  american: "american", burger: "american", burgers: "american", أمريكي: "american",
  italian: "italian", pizza: "italian", إيطالي: "italian",
  indian: "indian", pakistani: "indian", هندي: "indian", "هندي وباكستاني": "indian",
  asian: "asian", chinese: "asian", japanese: "asian", thai: "asian", korean: "asian", آسيوي: "asian",
  turk_persian: "turkish", turkish: "turkish", iranian: "turkish", persian: "turkish", "تركي وإيراني": "turkish",
  egypt_arab: "egyptian", egyptian: "egyptian", arabic: "egyptian", "مصري وعربي": "egyptian",
  world: "world", international: "world", عالمي: "world",
  grill_bbq: "grills", grill: "grills", grills: "grills", bbq: "grills", مشويات: "grills",
  sandwiches: "sandwiches", sandwich: "sandwiches", ساندويتشات: "sandwiches",
  breakfast: "breakfast", فطور: "breakfast",
  seafood: "seafood", بحري: "seafood",
  healthy: "healthy", صحي: "healthy",
  coffee_tea: "coffee", coffee: "coffee", tea: "coffee", cafe: "coffee", "قهوة وشاي": "coffee",
  desserts: "desserts", sweets: "desserts", حلويات: "desserts",
  bakery: "bakery", مخابز: "bakery", مخبوزات: "bakery",
  juice: "juices", juices: "juices", عصيرات: "juices",
};

export function restaurantCategoryImage(cuisines: readonly string[]) {
  // Follow the server's category order; never guess from the restaurant name.
  for (const cuisine of cuisines) {
    const category = aliases[cuisine.trim().toLowerCase()];
    if (category) return images[category];
  }
  return images.fallback;
}
