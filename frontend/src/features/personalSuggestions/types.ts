import type { RestaurantSummary } from "@/features/restaurants";

// نرسل مصدر موقع واحد فقط مع طلب الترشيحات.
export type RecommendationLocation =
  | {
      kind: "coordinates";
      lat: number;
      lon: number;
    }
  | {
      kind: "district";
      districtId: string;
    }
  | {
      kind: "none";
    };

// نفس بيانات بطاقة المطعم، ومعها تفاصيل الترشيح من الباك.
export type PersonalRestaurant = RestaurantSummary & {
  match_score: number;
  reason: string;
  distance_km: number | null;
};

// شكل الرد المتفق عليه.
export type PersonalRecommendationsResponse = {
  restaurants: PersonalRestaurant[];
};