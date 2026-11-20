import { useEffect, useRef } from "react";
import { Link, Route, Routes, useLocation, useSearchParams } from "react-router";
import { LoginPage, SessionMenu } from "../features/auth";
import { ErrorBoundary } from "../shared/ui/ErrorBoundary";
import { CustomerSessionBoundary } from "./CustomerSessionBoundary";
import { StorefrontLayout } from "./StorefrontLayout";
import { CartRoute, NotFoundRoute, ProductDetailRoute, ProductListRoute } from "./storefront-routes";
import styles from "./App.module.css";

/**
 * Adds the customer's requested currency to a navigation path, such as "/cart" becoming "/cart?currency=EUR".
 *
 * The currency lives in the URL, so a link without it would silently show the cart in the base currency. The value
 * is passed along unchanged; `StorefrontLayout` still checks it against the enabled currencies.
 */
function useCurrencyPath() {
  const [params] = useSearchParams();
  const currency = params.get("currency");
  return (path: string) => (currency ? `${path}?${new URLSearchParams({ currency })}` : path);
}

/** The page shell and the complete route table. Features are combined in `storefront-routes.tsx`. */
export function App() {
  const location = useLocation();
  const currencyPath = useCurrencyPath();
  const main = useRef<HTMLElement>(null);

  useEffect(() => {
    main.current?.focus();
  }, [location.pathname]);

  return (
    <>
      <a className={styles.skipLink} href="#main-content">
        Skip to main content
      </a>
      <header className={styles.header}>
        <Link className={styles.brand} to={currencyPath("/")}>
          Everyday Store
        </Link>
        <nav aria-label="Main navigation">
          <Link to={currencyPath("/")}>Shop</Link>
          <Link to={currencyPath("/cart")}>Cart</Link>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1} ref={main} className={styles.page}>
        <CustomerSessionBoundary>
          <SessionMenu />
          {/* Keyed by path: a broken product page recovers when the customer opens another page. */}
          <ErrorBoundary scope="page" resetKey={location.pathname}>
            <Routes>
              {/* Outside the layout, so a failed store-configuration read cannot block signing in. */}
              <Route path="/login" element={<LoginPage />} />
              <Route element={<StorefrontLayout />}>
                <Route path="/" element={<ProductListRoute />} />
                <Route path="/products/:slug" element={<ProductDetailRoute />} />
                <Route path="/cart" element={<CartRoute />} />
                <Route path="*" element={<NotFoundRoute />} />
              </Route>
            </Routes>
          </ErrorBoundary>
        </CustomerSessionBoundary>
      </main>
      <footer className={styles.footer}>Everyday Store · Catalog and cart preview</footer>
    </>
  );
}
