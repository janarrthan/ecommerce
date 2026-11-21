import { type SubmitEvent } from "react";
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

/** Keeps shareable search and category filters in the URL and lets the server filter the catalog. */
export function ProductListPage({ currency }: { currency: string }) {
  const [params, setParams] = useSearchParams();
  const search = params.get("search") ?? "";
  const category = params.get("category") ?? "";
  const query = useProducts(currency, search, category);
  const categoryQuery = useCategories();
  const categories = categoryQuery.data?.categories ?? [];
  // Based on data, not on success: a failed background refresh keeps the last list, so the field stays usable.
  const categoriesReady = categoryQuery.data !== undefined;

  // A shared link may name a category with no active product, such as an old bookmark. Keep it selectable so the
  // form matches the URL. While the list loads, this option also shows the URL's category in the disabled field.
  const unlistedCategory = category !== "" && !categories.some((entry) => entry.slug === category);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setParams(filterParams(new FormData(event.currentTarget), currency, category));
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
