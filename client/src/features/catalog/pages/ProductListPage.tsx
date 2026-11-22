import { type SubmitEvent, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router";
import { RequestError } from "../../../shared/ui/RequestError";
import { formatMoney } from "../../../shared/lib/money";
import { useCategories, useProducts } from "../catalog.queries";
import { ProductImage } from "../components/ProductImage";
import type { Product } from "../catalog.schemas";
import styles from "../catalog.module.css";

/**
 * Builds the URL query for the submitted filters, such as "currency=EUR&search=hoodie".
 *
 * Empty or space-only fields are left out, so clearing the search box removes it from the URL instead of searching
 * for "". The currency is always kept, so filtering never switches the customer back to the base currency.
 */
function filterParams(fields: FormData, currency: string, currentCategory: string): URLSearchParams {
  const next = new URLSearchParams({ currency });
  // A disabled field is left out of the form data. While the category list is loading or has failed, keep the
  // category from the URL, so searching inside Apparel does not silently drop Apparel.
  const category = fields.has("category") ? fields.get("category") : currentCategory;

  for (const [name, value] of [
    ["search", fields.get("search")],
    ["category", category],
  ] as const) {
    const trimmed = String(value ?? "").trim();
    if (trimmed) next.set(name, trimmed);
  }

  return next;
}

/** Returns the lowest-priced variant for the "From" price, or undefined when the product has no active variant. */
function cheapestVariant(product: Product) {
  return [...product.variants].sort((left, right) => left.price.amountMinor - right.price.amountMinor)[0];
}

/** Keeps shareable search and category filters in the URL, lets the server filter the catalog, and loads it in pages. */
export function ProductListPage({ currency }: { currency: string }) {
  const [params, setParams] = useSearchParams();
  const search = params.get("search") ?? "";
  const category = params.get("category") ?? "";
  const query = useProducts(currency, search, category);
  const categoryQuery = useCategories();
  const categories = categoryQuery.data?.categories ?? [];
  // Based on data, not on success: a failed background refresh keeps the last list, so the field stays usable.
  const categoriesReady = categoryQuery.data !== undefined;
  const products = query.data?.pages.flatMap((page) => page.products) ?? [];
  const gridRef = useRef<HTMLUListElement>(null);
  // Remembers where "Load more" added products, so focus can move there once they render.
  const pendingFocus = useRef<{ listKey: string; index: number } | null>(null);
  const listKey = `${currency}:${search}:${category}`;

  // A shared link may name a category with no active product, such as an old bookmark. Keep it selectable so the
  // form matches the URL. While the list loads, this option also shows the URL's category in the disabled field.
  const unlistedCategory = category !== "" && !categories.some((entry) => entry.slug === category);
  // A background refresh shows "Updating products". Loading the next page has its own label on the button.
  const refreshing = query.isFetching && !query.isFetchingNextPage;
  const loadMoreLabel = query.isFetchingNextPage ? "Loading more products…" : "Load more products";

  // Moves focus to the first new product after "Load more". Without this, focus is lost when the button disappears
  // on the last page, and a keyboard user would have to tab through every earlier product again.
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;

    // The filters changed before the page arrived, so the saved position belongs to another list.
    if (pending.listKey !== listKey) {
      pendingFocus.current = null;
      return;
    }

    if (products.length <= pending.index) return;
    pendingFocus.current = null;
    gridRef.current?.querySelectorAll<HTMLAnchorElement>(":scope > li > a")[pending.index]?.focus();
  }, [listKey, products.length]);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setParams(filterParams(new FormData(event.currentTarget), currency, category));
  }

  function handleLoadMore() {
    // A second click while loading would cancel the running request and start it again.
    if (query.isFetchingNextPage) return;
    pendingFocus.current = { listKey, index: products.length };
    void query.fetchNextPage();
  }

  return (
    <section>
      <h1>Everyday essentials</h1>
      <p>Thoughtful pieces for work and downtime.</p>
      <form key={`${search}:${category}`} className={styles.filters} onSubmit={handleSubmit}>
        <label>
          Search products
          <input name="search" type="search" defaultValue={search} />
        </label>
        <label>
          Category
          {/* The key mounts a new field when the list arrives. A select applies defaultValue only once, so without it
              a link such as ?category=apparel would show "All categories" after loading. */}
          <select
            key={categoriesReady ? "ready" : "waiting"}
            name="category"
            defaultValue={category}
            disabled={!categoriesReady}
          >
            <option value="">All categories</option>
            {unlistedCategory && <option value={category}>Selected category</option>}
            {categories.map((entry) => (
              <option key={entry.id} value={entry.slug}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Apply filters</button>
        <Link to={`/?currency=${currency}`}>Clear filters</Link>
      </form>
      {categoryQuery.isError && <RequestError error={categoryQuery.error} retry={() => void categoryQuery.refetch()} />}

      {query.isPending ? (
        <p role="status">Loading products…</p>
      ) : query.data === undefined ? (
        <RequestError error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          {refreshing && <p role="status">Updating products…</p>}
          {query.isRefetchError && <RequestError error={query.error} retry={() => void query.refetch()} />}
          {products.length === 0 && <p>No products match these filters. Try another search or clear the filters.</p>}
          <ul ref={gridRef} className={styles.grid}>
            {products.map((product) => {
              const cheapest = cheapestVariant(product);
              const image = product.images[0];
              return (
                <li key={product.id}>
                  <Link to={`/products/${encodeURIComponent(product.slug)}?currency=${currency}`}>
                    {image ? (
                      <ProductImage key={image.url} url={image.url} alt={image.altText ?? product.name} />
                    ) : (
                      <p className="imageFallback">No product image.</p>
                    )}
                    <h2>{product.name}</h2>
                  </Link>
                  {cheapest ? (
                    <p>
                      From{" "}
                      {formatMoney(cheapest.price.amountMinor, cheapest.price.currency, cheapest.price.minorUnitDigits)}
                    </p>
                  ) : (
                    <p>Currently unavailable</p>
                  )}
                </li>
              );
            })}
          </ul>
          {/* A failed next page keeps the products already shown. Try again asks for that page only. */}
          {query.isFetchNextPageError ? (
            <RequestError error={query.error} retry={() => void query.fetchNextPage()} />
          ) : (
            query.hasNextPage && (
              // aria-disabled, not disabled: some browsers drop focus from a button that becomes disabled.
              <button
                type="button"
                className={styles.loadMore}
                onClick={handleLoadMore}
                aria-disabled={query.isFetchingNextPage}
              >
                {loadMoreLabel}
              </button>
            )
          )}
        </>
      )}
    </section>
  );
}
