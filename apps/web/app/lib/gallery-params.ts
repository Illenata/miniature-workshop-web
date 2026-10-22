import { DEFAULT_SORT, factionSchema, sortSchema, type Faction, type Sort } from "@mw/contract";

/** Gallery state that lives in the URL, so every view is shareable and works without JS. */
export type GalleryParams = { faction: Faction | undefined; sort: Sort };

export function parseGalleryParams(search: URLSearchParams): GalleryParams {
  const faction = factionSchema.safeParse(search.get("faction"));
  const sort = sortSchema.safeParse(search.get("sort"));
  return {
    faction: faction.success ? faction.data : undefined,
    // Unknown values fall back to the default instead of an error page.
    sort: sort.success ? sort.data : DEFAULT_SORT,
  };
}

/** Defaults are left out, so the plain /gallery URL stays canonical. */
export function galleryHref({ faction, sort }: GalleryParams): string {
  const params = new URLSearchParams();
  if (faction) params.set("faction", faction);
  if (sort !== DEFAULT_SORT) params.set("sort", sort);
  return params.size ? `/gallery?${params}` : "/gallery";
}
