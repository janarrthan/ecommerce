import { type SubmitEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { RequestError } from "../../../shared/ui/RequestError";
import { formatMoney } from "../../../shared/lib/money";
import { usePublicQueryClient } from "../../../shared/api/public-query-context";
import { productsQueryOptions, useProducts } from "../catalog.queries";
import { ProductImage } from "../components/ProductImage";
import type { Product } from "../catalog.schemas";
import styles from "../catalog.module.css";

type Category = Product["categories"][number];

/**
 * Collects each category once, sorted by name, from the categories attached to every product.
 *
 * The Desk Organizer Set and the Ergonomic Laptop Stand are both in "Workspace", but they produce one "Workspace"
 * choice, because the categories are keyed by their slug.
 *
 * Temporary limitation: the storefront API has no category-list endpoint yet, so this page downloads the complete
 * product list, with every variant, price, and image, only to read the category names from it. That works only while
 * the product list is unpaginated. Once the server returns one page of products at a time, a category used only by
 * products on a later page would be missing from the choices.
 *
 * A future `GET /api/storefront/categories` endpoint replaces this function and the unfiltered product query in
 * `ProductListPage`. The backend and client tasks are recorded in `eccommerce/progress.md` under "Recorded Temporary
 * Limitations From The Client Rebuild".
 */
function uniqueCategories(products: Product[]): Category[] {
  const bySlug = new Map(
    products.flatMap((product) => product.categories.map((entry) => [entry.slug, entry] as const)),
  );
  return [...bySlug.values()].sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Builds the URL query for the submitted filters, such as "currency=EUR&search=hoodie".
 *
 * Empty or space-only fields are left out, so clearing the search box removes it from the URL instead of searching
 * for "". The currency is always kept, so filtering never switches the customer back to the base currency.
 */
function filterParams(fields: FormData, currency: string): URLSearchParams {
  const next = new URLSearchParams({ currency });

  for (const field of ["search", "category"]) {
    const value = String(fields.get(field) ?? "").trim();
    if (value) next.set(field, value);
  }

  return next;
}

/** Returns the lowest-priced variant for the "From" price, or undefined when the product has no active variant. */
function cheapestVariant(product: Product) {
  return [...product.variants].sort((left, right) => left.price.amountMinor - right.price.amountMinor)[0];
}

/** Keeps shareable search and category filters in the URL and lets the server filter the catalog. */
export function ProductListPage({ currency }: { currency: string }) {
  const publicClient = usePublicQueryClient();
  const [params, setParams] = useSearchParams();
  const search = params.get("search") ?? "";
  const category = params.get("category") ?? "";
  const query = useProducts(currency, search, category);

  // Read the category choices from the unfiltered list, with no search and no category. The filtered list would hide
  // every other category once the customer picked one: choosing Apparel leaves only the hoodie, so Workspace and
  // Accessories would disappear from the choices.
  // Temporary: the category endpoint described above `uniqueCategories` replaces this query.
  const categoryQuery = useQuery(
    {
      ...productsQueryOptions(currency, "", ""),
      staleTime: 60_000,
      select: ({ products }) => uniqueCategories(products),
    },
    publicClient,
  );
  const categories = categoryQuery.data ?? [];

  // A shared link may name a category that no current product uses. Keep it selectable so the form matches the URL.
  const unlistedCategory = category !== "" && !categories.some((entry) => entry.slug === category);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setParams(filterParams(new FormData(event.currentTarget), currency));
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
          <select name="category" defaultValue={category} disabled={categoryQuery.isPending || categoryQuery.isError}>
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
      ) : query.isError ? (
        <RequestError error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          {query.isFetching && <p role="status">Updating products…</p>}
          {query.data.products.length === 0 && (
            <p>No products match these filters. Try another search or clear the filters.</p>
          )}
          <ul className={styles.grid}>
            {query.data.products.map((product) => {
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
        </>
      )}
    </section>
  );
}
