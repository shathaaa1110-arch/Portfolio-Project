import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/shared/api/errors";
import { getRestaurants, type RestaurantsResponse } from "./api";

type PageRequest = { query: string; offset: number; attempt: number; refreshing: boolean };
type PageState = {
  request: PageRequest | null;
  page: { query: string; response: RestaurantsResponse } | null;
  loading: boolean;
  error: string | null;
};

export function useRestaurants(search = "") {
  const query = search.trim();
  const [paging, setPaging] = useState<PageRequest>({ query: "", offset: 0, attempt: 0, refreshing: false });
  useEffect(() => {
    setPaging(current => current.query === query ? current : { query, offset: 0, attempt: 0, refreshing: false });
  }, [query]);
  const request = useMemo<PageRequest>(() => paging.query === query ? paging
    : { query, offset: 0, attempt: 0, refreshing: false }, [paging, query]);
  const [state, setState] = useState<PageState>({ request: null, page: null, loading: true, error: null });

  useEffect(() => {
    let active = true;
    setState(previous => ({ ...previous, request, loading: true, error: null }));
    // Debounce typing; pagination and refreshing use the same bounded server query.
    const timer = setTimeout(() => {
      void (async () => {
        try {
          let response = await getRestaurants(request.offset, request.query);
          if (!active) return;
          const lastOffset = Math.max(0, (Math.ceil(response.total / response.limit) - 1) * response.limit);
          if (response.offset > lastOffset) {
            response = await getRestaurants(lastOffset, request.query);
            if (!active) return;
          }
          setState({ request, page: { query: request.query, response }, loading: false, error: null });
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
  }, [request]);

  // Never label the preceding search's data as the new search's result.
  const page = state.page?.query === query ? state.page.response : null;
  const isLoading = state.request !== request || state.loading;
  const error = state.request === request ? state.error : null;
  const restaurants = page?.restaurants ?? [];
  const pageCount = page ? Math.ceil(page.total / page.limit) : 0;
  const pageNumber = page && page.total > 0 ? Math.floor(page.offset / page.limit) + 1 : 0;
  const status: "ready" | "loading" | "error" = restaurants.length > 0 ? "ready"
    : error ? "error" : isLoading ? "loading" : "ready";
  const canGoPrevious = !isLoading && !!page && page.offset > 0;
  const canGoNext = !isLoading && !!page && page.offset + page.limit < page.total;

  function loadPage(offset: number, refreshing = false) {
    if (isLoading) return;
    setPaging(previous => ({ query, offset, refreshing, attempt: previous.attempt + 1 }));
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
