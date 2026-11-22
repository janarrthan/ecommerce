import { vi } from "vitest";
import { cartFixture, categoriesFixture, productFixture, userFixture } from "./fixtures";
import type { User } from "../features/auth/auth.schemas";

/**
 * Supplies deterministic HTTP responses for client integration tests. These are browser-side contract tests;
 * they do not establish that the real Express routes, CSRF middleware, or database work.
 */
export function installMockApi(
  options: {
    signedIn?: boolean;
    intercept?: (url: URL, init: RequestInit) => Response | Promise<Response> | undefined;
  } = {},
) {
  let sessionUser: User | null = options.signedIn ? userFixture() : null;
  let quantity = 0;
  let cartVariant = "large-blue";

  const json = (body: unknown, status = 200) => Response.json(body, { status });

  const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), "http://localhost");
    const intercepted = options.intercept?.(url, init);

    if (intercepted) return intercepted;

    if (url.pathname === "/api/auth/me") return json({ user: sessionUser });

    if (url.pathname === "/api/auth/login") {
      const credentials = JSON.parse(String(init.body));
      if (credentials.password !== "DemoPass123!")
        return json({ error: { message: "Invalid email or password." } }, 401);

      sessionUser = userFixture();
      return json({ user: sessionUser });
    }

    if (url.pathname === "/api/auth/csrf-token")
      return sessionUser ? json({ csrfToken: "test-token" }) : json({ error: {} }, 401);

    if (url.pathname === "/api/auth/logout") {
      if (new Headers(init.headers).get("x-csrf-token") !== "test-token") return json({ error: {} }, 403);

      sessionUser = null;
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/api/storefront/pricing")
      return json({ pricing: { baseCurrency: "USD", currencies: [{ code: "USD", minorUnitDigits: 2 }] } });

    if (url.pathname === "/api/storefront/categories") return json({ categories: categoriesFixture() });

    const product = productFixture();

    if (url.pathname.endsWith("/variant")) {
      const ids = url.searchParams.getAll("optionValueIds");
      const variant = product.variants.find((item) =>
        item.optionValues.every((selection) => ids.includes(selection.valueId)),
      );

      return json(
        variant
          ? { availability: variant.stock ? "in_stock" : "out_of_stock", variant }
          : { availability: "unavailable", variant: null },
      );
    }

    if (url.pathname === "/api/storefront/products") return json({ products: [product], nextCursor: null });
    if (url.pathname === `/api/storefront/products/${product.slug}`) return json({ product });

    if (url.pathname.startsWith("/api/storefront/cart")) {
      if (!sessionUser) return json({ error: {} }, 401);

      if (init.method === "PUT" || init.method === "DELETE") {
        if (new Headers(init.headers).get("x-csrf-token") !== "test-token") return json({ error: {} }, 403);
        cartVariant = decodeURIComponent(url.pathname.split("/").at(-1)!);
        quantity = init.method === "DELETE" ? 0 : JSON.parse(String(init.body)).quantity;
      }

      return json(cartFixture(quantity, cartVariant));
    }

    return json({ error: { message: "Not found." } }, 404);
  });

  vi.stubGlobal("fetch", fetch);

  return {
    fetch,
    expire: () => {
      sessionUser = null;
    },

    changeUser: (user: User | null) => {
      sessionUser = user;
    },
  };
}
