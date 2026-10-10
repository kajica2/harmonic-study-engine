import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PwaPrompt } from "./PwaPrompt";

class InstallPrompt extends Event {
  prompt = vi.fn().mockResolvedValue(undefined);
  userChoice = Promise.resolve({ outcome: "accepted" as const, platform: "web" });
}

describe("PwaPrompt", () => {
  afterEach(() => {
    act(() => window.dispatchEvent(new Event("online")));
  });

  it("offers installation when the browser exposes an install prompt", async () => {
    render(<PwaPrompt />);
    const prompt = new InstallPrompt("beforeinstallprompt");

    act(() => window.dispatchEvent(prompt));
    fireEvent.click(await screen.findByRole("button", { name: "Install app" }));

    await waitFor(() => expect(prompt.prompt).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole("button", { name: "Install app" })).toBeNull());
  });

  it("announces offline status and clears it when connectivity returns", async () => {
    render(<PwaPrompt />);
    act(() => window.dispatchEvent(new Event("offline")));

    expect((await screen.findByRole("status")).textContent).toContain("Offline");
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });
});
