import { Link, useLocation } from "react-router";
import { loginPath, SessionCheck, useSession } from "../features/auth";
import { ProductDetailPage, ProductListPage, type Variant } from "../features/catalog";
import { CartPage, SetCartQuantity, type CartAccess } from "../features/cart";
import { useStorefrontCurrency } from "./storefront-currency";

/** Turns auth's session into the access the cart feature needs, or null when nobody is signed in. */
function useCartAccess(): CartAccess | null {
  const session = useSession();
  return session.status === "ready" && session.user
    ? {
        customerId: session.user.id,
        authenticated: session.authenticated,
        expire: session.expire,
      }
    : null;
}

type CartQuantityProps = { variant: Variant; currency: string; refreshing: boolean };

/** The product page's cart control for a signed-in customer, or a sign-in link that returns to this product. */
function CartQuantity({ variant, currency, refreshing }: CartQuantityProps) {
  const access = useCartAccess();
  const { busy } = useSession();
  const location = useLocation();

  if (!access) return <Link to={loginPath(location.pathname + location.search)}>Sign in to set cart quantity</Link>;

  return (
    <SetCartQuantity
      key={variant.id}
      access={access}
      currency={currency}
      variantId={variant.id}
      stock={variant.stock}
      disabled={refreshing || busy}
    />
  );
}

/** The cart page for a signed-in customer, or a sign-in link that returns to the cart in the same currency. */
function CartContent({ currency }: { currency: string }) {
  const access = useCartAccess();
  if (access) return <CartPage access={access} currency={currency} />;
  return (
    <section>
      <h1>Your cart</h1>
      <Link to={loginPath(`/cart?${new URLSearchParams({ currency })}`)}>Sign in to view your cart</Link>
    </section>
  );
}

/** The page at "/". */
export function ProductListRoute() {
  const currency = useStorefrontCurrency();
  return <ProductListPage currency={currency} />;
}

/** The page at "/products/:slug". The catalog page decides when to show a cart control; this route supplies it. */
export function ProductDetailRoute() {
  const currency = useStorefrontCurrency();
  return (
    <ProductDetailPage
      currency={currency}
      renderCartAction={(variant, refreshing) => (
        <SessionCheck>
          <CartQuantity variant={variant} currency={currency} refreshing={refreshing} />
        </SessionCheck>
      )}
    />
  );
}

/** The page at "/cart". */
export function CartRoute() {
  const currency = useStorefrontCurrency();
  return (
    <SessionCheck>
      <CartContent currency={currency} />
    </SessionCheck>
  );
}

/** The page for any path that matches no other route, such as "/missing". */
export function NotFoundRoute() {
  const currency = useStorefrontCurrency();
  return (
    <section>
      <h1>Page not found</h1>
      <Link to={`/?${new URLSearchParams({ currency })}`}>Return to the storefront</Link>
    </section>
  );
}
