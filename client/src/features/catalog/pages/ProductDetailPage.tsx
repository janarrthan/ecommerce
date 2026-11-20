import { type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router";
import { RequestError } from "../../../shared/ui/RequestError";
import { formatMoney } from "../../../shared/lib/money";
import { useProduct, useVariant } from "../catalog.queries";
import type { Product, ResolvedVariant, Variant } from "../catalog.schemas";
import { VariantSelector } from "../components/VariantSelector";
import { ProductImage } from "../components/ProductImage";
import styles from "../catalog.module.css";

type Props = { currency: string; renderCartAction: (variant: Variant, refreshing: boolean) => ReactNode };

const availabilityText: Record<ResolvedVariant["availability"], string> = {
  unavailable: "This combination is unavailable.",
  out_of_stock: "This variant is out of stock.",
  in_stock: "In stock.",
};

/**
 * Matches the option-value IDs in the URL to this product's options, giving "" for an option with no valid choice.
 *
 * For example, "?optionValueIds=large&optionValueIds=blue" selects Large for Size and Blue for Color. An ID that
 * belongs to no option of this product, such as one copied from another product's link, is ignored.
 */
function readSelection(product: Product, requestedIds: string[]): Record<string, string> {
  return Object.fromEntries(
    product.options.map((option) => [
      option.id,
      option.values.find((value) => requestedIds.includes(value.id))?.id ?? "",
    ]),
  );
}

/** Lists the chosen value IDs in option order, leaving out options that are still unchosen. */
function chosenValueIds(product: Product, selected: Record<string, string>): string[] {
  return product.options.flatMap((option) =>
    option.values.some((value) => value.id === selected[option.id]) ? [selected[option.id]] : [],
  );
}

/**
 * Writes a selection back into the URL while keeping every other parameter, such as the currency.
 *
 * Each option contributes at most one ID, in option order, so choosing Blue replaces the earlier color instead of
 * adding a second one.
 */
function withSelection(params: URLSearchParams, product: Product, selected: Record<string, string>): URLSearchParams {
  const next = new URLSearchParams(params);

  next.delete("optionValueIds");

  for (const option of product.options) {
    const id = selected[option.id];
    if (id) next.append("optionValueIds", id);
  }
  return next;
}

/** Loads the product before mounting its selection state; a different product gets independent selections. */
export function ProductDetailPage(props: Props) {
  const { slug = "" } = useParams();
  const query = useProduct(slug, props.currency);
  if (query.isPending) return <p role="status">Loading product…</p>;
  if (query.isError) return <RequestError error={query.error} retry={() => void query.refetch()} />;

  return (
    <ProductSelection
      key={query.data.product.id}
      {...props}
      product={query.data.product}
      refreshing={query.isFetching}
    />
  );
}

function ProductSelection({
  product,
  currency,
  renderCartAction,
  refreshing,
}: Props & { product: Product; refreshing: boolean }) {
  const [params, setParams] = useSearchParams();
  const requestedIds = params.getAll("optionValueIds");
  const selected = readSelection(product, requestedIds);
  const valueIds = chosenValueIds(product, selected);
  const complete = valueIds.length === product.options.length;
  const query = useVariant(product.slug, currency, valueIds, complete);
  const result = complete ? query.data : undefined;
  const images = result?.variant?.images ?? product.images;

  function handleOptionChange(optionId: string, valueId: string) {
    // Replace the URL entry instead of adding one, so the browser's Back button leaves the product page rather than
    // stepping back through every option the customer tried.
    setParams(withSelection(params, product, { ...selected, [optionId]: valueId }), { replace: true });
  }

  return (
    <article className={styles.detail}>
      <div className={styles.gallery}>
        {images.length === 0 ? (
          <p className="imageFallback">No product image.</p>
        ) : (
          images.map((image) => (
            <ProductImage key={`${image.id}:${image.url}`} url={image.url} alt={image.altText ?? product.name} />
          ))
        )}
      </div>
      <div>
        <h1>{product.name}</h1>
        <p>{product.description}</p>
        {product.options.length > 0 && (
          <VariantSelector product={product} selected={selected} onChange={handleOptionChange} />
        )}
        {!complete ? (
          <p>Select one value for every option.</p>
        ) : query.isPending ? (
          <p role="status">Checking this combination…</p>
        ) : query.isError ? (
          <RequestError error={query.error} retry={() => void query.refetch()} />
        ) : (
          result && (
            <>
              <p role="status">{availabilityText[result.availability]}</p>
              {result.variant && (
                <p>
                  {formatMoney(
                    result.variant.price.amountMinor,
                    result.variant.price.currency,
                    result.variant.price.minorUnitDigits,
                  )}
                </p>
              )}
              {result.availability === "in_stock" && renderCartAction(result.variant, refreshing || query.isFetching)}
            </>
          )
        )}
      </div>
    </article>
  );
}
