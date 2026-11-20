import { describe, expect, it } from "vitest";
import { loginPath, safeReturnTo } from "../auth.navigation";

describe("sign-in return navigation", () => {
  it("preserves local product choices", () => {
    expect(safeReturnTo("/products/hoodie?optionValueIds=large&optionValueIds=blue")).toBe(
      "/products/hoodie?optionValueIds=large&optionValueIds=blue",
    );
  });
  it.each([null, "https://example.com", "//example.com", "/\\example.com", "javascript:alert(1)"])(
    "rejects an external or unsafe destination: %s",
    (value) => {
      expect(safeReturnTo(value)).toBe("/");
    },
  );
  it("encodes the return path so the login page reads it back unchanged", () => {
    const productPath = "/products/hoodie?currency=EUR&optionValueIds=large&optionValueIds=blue";
    const link = loginPath(productPath);
    expect(link).toBe(
      "/login?returnTo=%2Fproducts%2Fhoodie%3Fcurrency%3DEUR%26optionValueIds%3Dlarge%26optionValueIds%3Dblue",
    );
    // The login page reads returnTo from its own query string and checks it with safeReturnTo.
    const returnTo = new URL(link, "https://storefront.invalid").searchParams.get("returnTo");
    expect(safeReturnTo(returnTo)).toBe(productPath);
  });
});
