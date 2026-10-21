// API fields used by the restaurant card.
export type RestaurantSummary = {
  id: number;
  name_ar: string;
  cuisines: string[];
  district: string;
  rating: number | null;
};