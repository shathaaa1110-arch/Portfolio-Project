// API fields used by the restaurant card.
export type RestaurantSummary = {
  id: number;
  name_ar: string;
  cuisines: string[];
  district: string;
  image_url?: string | null;
  rating: number | null;
  maps_url?: string | null;
  // Optional until the API exposes the database spend range.
  spend_low?: number | null;
  spend_high?: number | null;
};