export type RestaurantFilters = { cuisine?: string; districtId?: string };

export type RestaurantDetailsData = RestaurantSummary & {
  name_en: string | null;
  district_id: string | null;
  price_tier: number | null;
  spend_low: number | null;
  spend_high: number | null;
  rating_count: number | null;
  opening_hours: { open_24h: boolean; opens: string | null; closes: string | null; days_open: number | null } | null;
  summary: string | null;
};

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
