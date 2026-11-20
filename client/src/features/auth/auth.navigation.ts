/** Allows only local return paths, so a crafted returnTo query cannot navigate to another website. */
export function safeReturnTo(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  try {
    const url = new URL(value, "https://storefront.invalid");
    return url.origin === "https://storefront.invalid" ? `${url.pathname}${url.search}${url.hash}` : "/";
  } catch {
    return "/";
  }
}

/**
 * Builds a sign-in link that comes back to a page afterwards.
 *
 * For example, "/products/hoodie?currency=EUR" becomes "/login?returnTo=%2Fproducts%2Fhoodie%3Fcurrency%3DEUR". The
 * "?" inside the return path is encoded, so it cannot be mixed up with the login page's own parameters.
 */
export function loginPath(returnTo: string): string {
  return `/login?${new URLSearchParams({ returnTo })}`;
}
