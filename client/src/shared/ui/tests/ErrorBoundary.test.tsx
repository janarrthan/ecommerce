import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setTelemetrySink, type ErrorReport } from "../../observability/telemetry";
import { ErrorBoundary } from "../ErrorBoundary";

let restore: (() => void) | undefined;

afterEach(() => {
  restore?.();
  restore = undefined;
  vi.restoreAllMocks();
});

function Broken({ fail }: { fail: boolean }) {
  if (fail) throw new Error("variant was null for customer@example.com");
  return <h1>Everyday Cotton Hoodie</h1>;
}

describe("rendering error boundary", () => {
  it("shows page recovery, reports only the category, and resets when the path changes", () => {
    // React logs caught rendering errors to the console; silence that expected output for this test.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reports: ErrorReport[] = [];
    restore = setTelemetrySink({ error: (report) => reports.push(report), vital: () => undefined });

    const view = render(
      <ErrorBoundary scope="page" resetKey="/products/broken">
        <Broken fail />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("heading", { name: "This page could not be displayed" })).toBeVisible();
    expect(reports).toEqual([{ category: "render", operation: "page.render" }]);
    expect(JSON.stringify(reports)).not.toContain("customer@example.com");

    view.rerender(
      <ErrorBoundary scope="page" resetKey="/products/everyday-cotton-hoodie">
        <Broken fail={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("heading", { name: "Everyday Cotton Hoodie" })).toBeVisible();
  });

  it("lets the customer try the same page again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let fail = true;
    function Flaky() {
      return <Broken fail={fail} />;
    }
    render(
      <ErrorBoundary scope="page" resetKey="/cart">
        <Flaky />
      </ErrorBoundary>,
    );
    fail = false;
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByRole("heading", { name: "Everyday Cotton Hoodie" })).toBeVisible();
  });
});
