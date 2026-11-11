import { useEffect, useState } from "react";
import { restaurantCategoryImage } from "./categoryImage";

// Only remote HTTPS photos are accepted. Missing/broken photos use the existing illustration.
export function useRestaurantImage(imageUrl: string | null | undefined, cuisines: string[]) {
  let uri: string | null = null;
  try {
    if (typeof imageUrl === "string") {
      const url = new URL(imageUrl);
      if (url.protocol === "https:" && url.hostname && !url.username && !url.password) uri = url.href;
    }
  } catch { /* Missing or malformed photo; retain the category image. */ }
  const [failedUri, setFailedUri] = useState<string | null>(null);
  useEffect(() => setFailedUri(null), [uri]);
  const illustrative = !uri || failedUri === uri;
  return {
    source: illustrative ? restaurantCategoryImage(cuisines) : { uri: uri! },
    illustrative,
    onError: () => { if (uri) setFailedUri(uri); },
  };
}
