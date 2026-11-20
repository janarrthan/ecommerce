import { focusManager, onlineManager, useQuery } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePublicQueryClient } from "../../shared/api/public-query-context";
import { installMockApi } from "../../test/mock-api";
import { Providers } from "../providers";

function CatalogProbe({ read }: { read: () => Promise<number> }) {
  const client = usePublicQueryClient();
  const query = useQuery({ queryKey: ["catalog", "lifecycle"], queryFn: read, staleTime: 0, retry: false }, client);
  return <p>Catalog read: {query.data ?? "loading"}</p>;
}

afterEach(() => {
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
});

describe("public query client lifecycle", () => {
  it.each(["focus", "reconnect"] as const)(
    "refreshes stale public data after %s without a root query provider",
    async (event) => {
      installMockApi();
      let reads = 0;
      const read = vi.fn(async () => ++reads);
      const view = render(
        <Providers>
          <CatalogProbe read={read} />
        </Providers>,
      );
      await screen.findByText("Catalog read: 1");

      act(() => {
        if (event === "focus") focusManager.setFocused(false);
        else onlineManager.setOnline(false);
      });
      act(() => {
        if (event === "focus") focusManager.setFocused(true);
        else onlineManager.setOnline(true);
      });

      await screen.findByText("Catalog read: 2");
      expect(read).toHaveBeenCalledTimes(2);
      view.unmount();
    },
  );
});
