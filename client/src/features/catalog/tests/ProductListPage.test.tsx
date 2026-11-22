import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../../shared/api/query-client";
import { PublicQueryContext } from "../../../shared/api/public-query-context";
import { productFixture } from "../../../test/fixtures";
import { installMockApi } from "../../../test/mock-api";
import { ProductListPage } from "../pages/ProductListPage";

afterEach(() => vi.unstubAllGlobals());

const categoriesPath = "/api/storefront/categories";
const productsPath = "/api/storefront/products";

/** Shows the current URL query, so a test can read what the filter form wrote. */
function CurrentQuery() {
  return <output aria-label="Current URL query">{useLocation().search}</output>;
}

function mount(path: string) {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  render(
    <PublicQueryContext.Provider value={client}>
      <MemoryRouter initialEntries={[path]}>
        <ProductListPage currency="USD" />
        <CurrentQuery />
      </MemoryRouter>
    </PublicQueryContext.Provider>,
  );
}

function currentQuery() {
  return new URLSearchParams(screen.getByLabelText("Current URL query").textContent ?? "");
}

/** Waits for the category field to be usable. Read it again afterwards: the page mounts a new field at that moment. */
async function waitForCategoryField() {
  await waitFor(() => expect(screen.getByLabelText("Category")).toBeEnabled());
  return screen.getByLabelText("Category");
}

/** Returns the URL of every product-list request the page made, in order. */
function productReads(api: ReturnType<typeof installMockApi>) {
  return api.fetch.mock.calls
    .map(([input]) => new URL(String(input), "http://localhost"))
    .filter((url) => url.pathname === productsPath);
}

/**
 * Serves the list as two pages: the hoodie, then the desk organizer after cursor "page-2". With `failSecondPage`, the
 * second page returns 503 until `recover()` is called.
 */
function installTwoPages({ failSecondPage = false } = {}) {
  let failing = failSecondPage;
  const deskOrganizer = {
    ...productFixture(),
    id: "desk-organizer",
    name: "Desk Organizer Set",
    slug: "desk-organizer",
  };
  const api = installMockApi({
    intercept: (url) => {
      if (url.pathname !== productsPath) return;
      if (url.searchParams.get("cursor") !== "page-2")
        return Response.json({ products: [productFixture()], nextCursor: "page-2" });
      if (failing) return Response.json({ error: { message: "Unavailable." } }, { status: 503 });
      return Response.json({ products: [deskOrganizer], nextCursor: null });
    },
  });
  return {
    ...api,
    recover: () => {
      failing = false;
    },
  };
}

/** Makes the category endpoint fail with 503 until `recover()` is called. */
function installFailingCategories() {
  let failing = true;
  const api = installMockApi({
    intercept: (url) =>
      failing && url.pathname === categoriesPath
        ? Response.json({ error: { message: "Unavailable." } }, { status: 503 })
        : undefined,
  });
  return {
    ...api,
    recover: () => {
      failing = false;
    },
  };
}

describe("product list category filter", () => {
  it("lists categories from the category endpoint and keeps a shared link's category selected", async () => {
    const api = installMockApi();
    mount("/?currency=USD&category=apparel");

    // The list arrives after the first render. Before this slice, the field fell back to "All categories" here.
    const select = await waitForCategoryField();
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["All categories", "Accessories", "Apparel", "Workspace"]);
    expect(select).toHaveValue("apparel");

    // Every product read carries the filter: the page no longer downloads the whole catalog to find category names.
    const reads = productReads(api);
    expect(reads.length).toBeGreaterThan(0);
    expect(new Set(reads.map((url) => url.searchParams.get("category")))).toEqual(new Set(["apparel"]));
  });

  it("keeps an unknown category from a shared link selectable", async () => {
    installMockApi();
    mount("/?currency=USD&category=retired-collection");

    const select = await waitForCategoryField();
    expect(select).toHaveValue("retired-collection");
    expect(within(select).getByRole("option", { name: "Selected category" })).toBeInTheDocument();
  });

  it("keeps the URL's category when the category list fails and the customer searches", async () => {
    installFailingCategories();
    mount("/?currency=USD&category=apparel");

    expect(await screen.findByRole("alert")).toHaveTextContent("temporarily unavailable");
    expect(screen.getByLabelText("Category")).toBeDisabled();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Search products"), "hoodie");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    await waitFor(() => expect(currentQuery().get("search")).toBe("hoodie"));
    expect(currentQuery().get("category")).toBe("apparel");
    expect(currentQuery().get("currency")).toBe("USD");
  });

  it("recovers the category list with Try again and keeps the URL's category selected", async () => {
    const api = installFailingCategories();
    mount("/?currency=USD&category=apparel");
    await screen.findByRole("alert");

    api.recover();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    const select = await waitForCategoryField();
    expect(select).toHaveValue("apparel");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("product list pages", () => {
  it("adds the next page below the first and moves focus to the first new product", async () => {
    const api = installTwoPages();
    mount("/?currency=USD&category=apparel");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Load more products" }));

    const newProduct = await screen.findByRole("link", { name: /Desk Organizer Set/ });
    await waitFor(() => expect(newProduct).toHaveFocus());
    expect(screen.getByRole("heading", { name: "Everyday Cotton Hoodie" })).toBeInTheDocument();
    // The second page was the last one, so the button is gone.
    expect(screen.queryByRole("button", { name: /more products/ })).not.toBeInTheDocument();

    // The next page keeps the filters and adds the cursor. The cursor never goes into the page URL.
    const nextPageReads = productReads(api).filter((url) => url.searchParams.has("cursor"));
    expect(nextPageReads.length).toBeGreaterThan(0);
    for (const url of nextPageReads) {
      expect(url.searchParams.get("cursor")).toBe("page-2");
      expect(url.searchParams.get("category")).toBe("apparel");
    }
    expect(currentQuery().has("cursor")).toBe(false);
  });

  it("keeps the loaded products when the next page fails, and Try again asks for that page only", async () => {
    const api = installTwoPages({ failSecondPage: true });
    mount("/?currency=USD");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Load more products" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("temporarily unavailable");
    expect(screen.getByRole("heading", { name: "Everyday Cotton Hoodie" })).toBeInTheDocument();

    api.recover();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    const newProduct = await screen.findByRole("link", { name: /Desk Organizer Set/ });
    await waitFor(() => expect(newProduct).toHaveFocus());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(productReads(api).filter((url) => !url.searchParams.has("cursor"))).toHaveLength(1);
  });
});
