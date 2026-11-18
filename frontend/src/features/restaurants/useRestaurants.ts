import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/shared/api/errors";
import { getRestaurants, type RestaurantsResponse } from "./api";
import type { RestaurantFilters } from "./types";

type PageRequest = { key: string; query: string; cuisine: string; districtId: string; offset: number; attempt: number; refreshing: boolean };
type PageState = {
  request: PageRequest | null;
  page: { key: string; response: RestaurantsResponse } | null;
  loading: boolean;
  error: string | null;
};

export function useRestaurants(search = "", filters: RestaurantFilters = {}, enabled = true) {
  const query = search.trim();
  const cuisine = filters.cuisine?.trim() ?? "";
  const districtId = filters.districtId?.trim() ?? "";
  const key = JSON.stringify([query, cuisine, districtId]);
  const [paging, setPaging] = useState<PageRequest>({ key, query, cuisine, districtId, offset: 0, attempt: 0, refreshing: false });
  useEffect(() => {
    setPaging(current => current.key === key ? current : { key, query, cuisine, districtId, offset: 0, attempt: 0, refreshing: false });
  }, [key, query, cuisine, districtId]);
  const request = useMemo<PageRequest>(() => paging.key === key ? paging
    : { key, query, cuisine, districtId, offset: 0, attempt: 0, refreshing: false }, [paging, key, query, cuisine, districtId]);
  const [state, setState] = useState<PageState>({ request: null, page: null, loading: true, error: null });

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setState(previous => ({ ...previous, request, loading: true, error: null }));
    // Debounce typing; pagination and refreshing use the same bounded server query.
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const selected = { cuisine: request.cuisine, districtId: request.districtId };
          let response = await getRestaurants(request.offset, request.query, selected);
          if (!active) return;
          const lastOffset = Math.max(0, (Math.ceil(response.total / response.limit) - 1) * response.limit);
          if (response.offset > lastOffset) {
            response = await getRestaurants(lastOffset, request.query, selected);
            if (!active) return;
          }
          setState({ request, page: { key: request.key, response }, loading: false, error: null });
        } catch (error) {
          if (!active) return;
          const message = error instanceof ApiError && error.code === "SEARCH_UNAVAILABLE"
            ? "البحث بكل المطاعم غير متاح حاليًا. امسح البحث لمتابعة التصفح."
            : "تعذّر تحميل المطاعم. حاول مرة أخرى.";
          setState(previous => ({ ...previous, request, loading: false, error: message }));
        }
      })();
    }, request.query && request.attempt === 0 ? 350 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [request, enabled]);

  // Never label the preceding search's data as the new search's result.
  const page = enabled && state.page?.key === key ? state.page.response : null;
  const isLoading = enabled && (state.request !== request || state.loading);
  const error = enabled && state.request === request ? state.error : null;
  const restaurants = page?.restaurants ?? [];
  const pageCount = page ? Math.ceil(page.total / page.limit) : 0;
  const pageNumber = page && page.total > 0 ? Math.floor(page.offset / page.limit) + 1 : 0;
  const status: "ready" | "loading" | "error" = restaurants.length > 0 ? "ready"
    : error ? "error" : isLoading ? "loading" : "ready";
  const canGoPrevious = !isLoading && !!page && page.offset > 0;
  const canGoNext = !isLoading && !!page && page.offset + page.limit < page.total;

  function loadPage(offset: number, refreshing = false) {
    if (!enabled || isLoading) return;
    setPaging(previous => ({ key, query, cuisine, districtId, offset, refreshing, attempt: previous.attempt + 1 }));
  }
  return {
    restaurants, status, error, total: page?.total ?? 0, pageNumber, pageCount, isLoading,
    isRefreshing: isLoading && request.refreshing,
    canGoNext, canGoPrevious,
    nextPage: () => { if (page && canGoNext) loadPage(page.offset + page.limit); },
    previousPage: () => { if (page && canGoPrevious) loadPage(Math.max(0, page.offset - page.limit)); },
    retry: () => loadPage(request.offset),
    refresh: () => loadPage(page?.offset ?? 0, true),
  };
}
