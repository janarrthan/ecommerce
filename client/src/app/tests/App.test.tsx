import type { QueryClient } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionProvider } from "../../features/auth";
import { createQueryClient } from "../../shared/api/query-client";
import { PublicQueryContext } from "../../shared/api/public-query-context";
import { installMockApi } from "../../test/mock-api";
import { cartFixture, productFixture } from "../../test/fixtures";
import { App } from "../App";
import { CustomerQueryClientFactory } from "../customer-query-client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mount(path = "/") {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  // The application asks this factory for each customer cache, so the test can inspect the exact retired client.
  const customerClients: QueryClient[] = [];
  const createCustomerClient = () => {
    const customer = createQueryClient();
    customer.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
    customerClients.push(customer);
    return customer;
  };
  const view = render(
    <PublicQueryContext.Provider value={client}>
      <CustomerQueryClientFactory.Provider value={createCustomerClient}>
        <SessionProvider>
          <MemoryRouter initialEntries={[path]}>
            <App />
          </MemoryRouter>
        </SessionProvider>
      </CustomerQueryClientFactory.Provider>
    </PublicQueryContext.Provider>,
  );
  return { ...view, client, customerClients };
}

/** Waits until a cart button can be used. The buttons use aria-disabled so they keep keyboard focus while saving. */
async function waitUntilUsable(name: string) {
  const button = await screen.findByRole("button", { name });
  await waitFor(() => expect(button).toHaveAttribute("aria-disabled", "false"));
  return button;
}

describe("storefront composition", () => {
  it("signs in, resolves options, sends a CSRF-protected absolute quantity, and reads the cart", async () => {
    const api = installMockApi();
    mount("/login?returnTo=%2Fproducts%2Feveryday-cotton-hoodie%3Fcurrency%3DUSD");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Email"), "customer@example.com");
    await user.type(screen.getByLabelText("Password"), "DemoPass123!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByRole("heading", { name: "Everyday Cotton Hoodie" });
    await user.selectOptions(screen.getByLabelText("Size"), "large");
    await user.selectOptions(screen.getByLabelText("Color"), "blue");
    const quantity = await screen.findByLabelText("Total quantity in cart");
    await user.clear(quantity);
    await user.type(quantity, "2");
    const save = await waitUntilUsable("Set cart quantity");
    await user.click(save);
    await waitFor(() => {
      const write = api.fetch.mock.calls.find(([, init]) => init?.method === "PUT");
      expect(write).toBeDefined();
      expect(JSON.parse(String(write?.[1]?.body))).toEqual({ quantity: 2 });
      expect(new Headers(write?.[1]?.headers).get("x-csrf-token")).toBe("test-token");
    });
    // The saved quantity changes from 0 to 2, but the form stays mounted: its message and focus survive.
    expect(await screen.findByText("Currently in your cart: 2.")).toBeVisible();
    expect(screen.getByText("Cart quantity saved.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Set cart quantity" })).toHaveFocus();
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    await user.click(within(nav).getByRole("link", { name: "Cart" }));
    await screen.findByRole("heading", { name: "Your cart" });
    expect(await screen.findByText("Merchandise subtotal: $135.98")).toBeVisible();
  });

  it("keeps the selected currency in the header links", async () => {
    installMockApi();
    mount("/products/everyday-cotton-hoodie?currency=USD");
    await screen.findByRole("heading", { name: "Everyday Cotton Hoodie" });
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(nav).getByRole("link", { name: "Cart" })).toHaveAttribute("href", "/cart?currency=USD");
    expect(within(nav).getByRole("link", { name: "Shop" })).toHaveAttribute("href", "/?currency=USD");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login?returnTo=%2Fproducts%2Feveryday-cotton-hoodie%3Fcurrency%3DUSD",
    );
  });

  it("falls back to the base currency and says so when the URL asks for a disabled one", async () => {
    installMockApi();
    mount("/products/everyday-cotton-hoodie?currency=XYZ");
    await screen.findByRole("heading", { name: "Everyday Cotton Hoodie" });
    expect(screen.getByLabelText("Currency")).toHaveValue("USD");
    expect(screen.getByText("That currency is not enabled. Showing USD.")).toBeVisible();
  });

  it("announces a removed line and moves focus to the cart heading", async () => {
    installMockApi({ signedIn: true });
    mount("/products/everyday-cotton-hoodie?currency=USD&optionValueIds=large&optionValueIds=blue");
    const user = userEvent.setup();
    await user.click(await waitUntilUsable("Set cart quantity"));
    await screen.findByText("Currently in your cart: 1.");
    await user.click(
      within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Cart" }),
    );
    await user.click(await waitUntilUsable("Remove item"));
    expect(await screen.findByText("Everyday Cotton Hoodie was removed from your cart.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your cart" })).toHaveFocus();
    expect(screen.getByText("Your cart is empty.", { exact: false })).toBeVisible();
  });

  it("shows a safe validation failure instead of rendering an invalid server price", async () => {
    let reads = 0;
    installMockApi({
      intercept: (url) => {
        if (url.pathname !== "/api/storefront/products") return;
        reads += 1;
        const product = productFixture();
        return Response.json({
          products: [{ ...product, variants: [{ ...product.variants[0], price: { amountMinor: "wrong" } }] }],
        });
      },
    });

    mount();
    // Temporary: the category choices read the same unfiltered product list, so one bad response shows two alerts.
    // Expect one alert again when GET /api/storefront/categories replaces that query.
    const alerts = await screen.findAllByRole("alert");
    expect(alerts).toHaveLength(2);
    for (const alert of alerts) expect(alert).toHaveTextContent("unexpected response");
    expect(reads).toBe(1);
    expect(screen.queryByRole("heading", { name: "Everyday Cotton Hoodie" })).not.toBeInTheDocument();
  });

  it("keeps an unavailable option combination distinct from out of stock", async () => {
    installMockApi();
    mount("/products/everyday-cotton-hoodie");
    const user = userEvent.setup();
    await screen.findByLabelText("Size");
    await user.selectOptions(screen.getByLabelText("Size"), "large");
    await user.selectOptions(screen.getByLabelText("Color"), "black");
    expect(await screen.findByText("This combination is unavailable.")).toBeVisible();
    expect(screen.queryByLabelText("Total quantity in cart")).not.toBeInTheDocument();
  });

  it("rejects invalid credentials without claiming a successful session", async () => {
    installMockApi();
    mount("/login");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Email"), "customer@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.");
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  it("clears private caches after logout and accepts the backend's empty response", async () => {
    installMockApi({ signedIn: true });
    const { client, customerClients } = mount("/cart");
    await screen.findByText("Your cart is empty.", { exact: false });
    const retired = customerClients.at(-1)!;
    retired.setQueryData(["customer", "test-customer", "private-sentinel"], { secret: "test-only" });
    const pricing = client.getQueryData(["catalog", "pricing"]);
    expect(pricing).toBeDefined();
    expect(retired.getQueriesData({ queryKey: ["catalog"] })).toEqual([]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("link", { name: "Sign in to view your cart" })).toBeVisible();
    expect(retired.getQueryCache().getAll()).toEqual([]);
    expect(retired.getMutationCache().getAll()).toEqual([]);
    expect(customerClients.at(-1)).not.toBe(retired);
    expect(client.getQueryData(["catalog", "pricing"])).toBe(pricing);
    expect(client.getQueriesData({ queryKey: ["customer"] })).toEqual([]);
  });

  it("offers route recovery and keyboard navigation", async () => {
    installMockApi();
    mount("/missing");
    await screen.findByRole("heading", { name: "Page not found" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("link", { name: "Return to the storefront" }));
    await screen.findByRole("heading", { name: "Everyday essentials" });
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(nav).getByRole("link", { name: "Cart" })).toHaveAttribute("href", "/cart?currency=USD");
  });

  it("ignores an obsolete variant response even when the transport ignores cancellation", async () => {
    let finishOld: ((response: Response) => void) | undefined;
    const product = productFixture();
    installMockApi({
      intercept: (url) => {
        if (!url.pathname.endsWith("/variant")) return;
        if (url.searchParams.getAll("optionValueIds").includes("large")) {
          return new Promise<Response>((resolve) => {
            finishOld = resolve;
          });
        }
        return Response.json({
          availability: "in_stock",
          variant: { ...product.variants[0], price: { ...product.variants[0].price, amountMinor: 200 } },
        });
      },
    });
    mount("/products/everyday-cotton-hoodie");
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText("Size"), "large");
    await user.selectOptions(screen.getByLabelText("Color"), "blue");
    await waitFor(() => expect(finishOld).toBeDefined());
    await user.selectOptions(screen.getByLabelText("Size"), "medium");
    expect(await screen.findByText("$2.00")).toBeVisible();
    await act(async () => {
      finishOld!(
        Response.json({
          availability: "in_stock",
          variant: { ...product.variants[1], price: { ...product.variants[1].price, amountMinor: 100 } },
        }),
      );
    });
    expect(screen.getByText("$2.00")).toBeVisible();
    expect(screen.queryByText("$1.00")).not.toBeInTheDocument();
  });

  it("does not repopulate a private cache when a pending write completes after logout", async () => {
    let finishWrite: ((response: Response) => void) | undefined;
    installMockApi({
      signedIn: true,
      intercept: (url, init) => {
        if (url.pathname.startsWith("/api/storefront/cart/items/") && init.method === "PUT") {
          return new Promise<Response>((resolve) => {
            finishWrite = resolve;
          });
        }
      },
    });
    const { client, customerClients } = mount(
      "/products/everyday-cotton-hoodie?optionValueIds=large&optionValueIds=blue",
    );
    const user = userEvent.setup();
    await user.click(await waitUntilUsable("Set cart quantity"));
    await waitFor(() => expect(finishWrite).toBeDefined());
    const retired = customerClients.at(-1)!;
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByRole("link", { name: "Sign in to set cart quantity" });
    await act(async () => {
      finishWrite!(Response.json(cartFixture(1)));
    });
    expect(client.getQueriesData({ queryKey: ["customer"] })).toEqual([]);
    expect(retired.getQueryCache().getAll()).toEqual([]);
    expect(customerClients.at(-1)).not.toBe(retired);
    expect(customerClients.at(-1)!.getQueriesData({ queryKey: ["customer"] })).toEqual([]);
  });
});
