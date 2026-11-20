/** Formats server-owned minor units: 4500 USD minor units with precision 2 display as $45.00 in en-US. */
export function formatMoney(amountMinor: number, currency: string, minorUnitDigits: number): string {
  if (
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 0 ||
    !Number.isInteger(minorUnitDigits) ||
    minorUnitDigits < 0 ||
    minorUnitDigits > 4
  ) {
    throw new Error("Expected a valid server-owned money amount.");
  }
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: minorUnitDigits,
    maximumFractionDigits: minorUnitDigits,
  });
  // Keep a large cart subtotal exact: converting 9007199254740991 minor units to a floating-point decimal loses cents.
  const amount = BigInt(amountMinor);
  const scale = 10n ** BigInt(minorUnitDigits);
  const fraction = (amount % scale).toString().padStart(minorUnitDigits, "0");
  return formatter
    .formatToParts(amount / scale)
    .map((part) => (part.type === "fraction" ? fraction : part.value))
    .join("");
}
