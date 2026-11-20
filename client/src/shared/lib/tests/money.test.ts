import { describe, expect, it } from "vitest";
import { formatMoney } from "../money";

describe("server money presentation", () => {
  it("uses server precision instead of assuming two decimal places", () => {
    expect(formatMoney(4500, "USD", 2)).toBe("$45.00");
    expect(formatMoney(4500, "JPY", 0)).toBe("¥4,500");
    expect(formatMoney(4500, "KWD", 3)).toContain("4.500");
    expect(formatMoney(Number.MAX_SAFE_INTEGER, "USD", 2)).toBe("$90,071,992,547,409.91");
  });
  it("rejects unsafe amounts before formatting", () => {
    expect(() => formatMoney(Number.MAX_SAFE_INTEGER + 1, "USD", 2)).toThrow();
    expect(() => formatMoney(-1, "USD", 2)).toThrow();
  });
});
