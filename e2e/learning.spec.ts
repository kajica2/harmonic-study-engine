import { test, expect } from "@playwright/test";

test("learning workflow persists across reload and language changes without a microphone", async ({
  page,
}) => {
  const privateRequests: string[] = [];
  page.on("request", (request) => {
    if (/recordings|synthesize|\/health|openrouter/.test(request.url()))
      privateRequests.push(request.url());
  });
  await page.addInitScript(() => {
    Object.assign(window, { learningMicRequests: 0 });
    navigator.mediaDevices.getUserMedia = () => {
      Object.assign(window, {
        learningMicRequests:
          (window as unknown as { learningMicRequests: number })
            .learningMicRequests + 1,
      });
      return Promise.reject(
        new Error("Learning should not request a microphone"),
      );
    };
  });
  await page.goto("/learn");
  await expect(
    page.getByRole("heading", { name: /Start with sound/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open lesson: Tap the swing", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /Listen Play the call/ }).check();
  await page
    .getByLabel("What did you hear?")
    .fill("Leave a little more space.");
  await page.getByRole("button", { name: /Tap your answer/ }).click();
  await page.getByRole("button", { name: /Tap your answer/ }).press("Space");
  await expect(
    page.getByRole("button", { name: /Tap your answer/ }),
  ).toContainText("2 taps");
  await page
    .getByRole("button", { name: "Play reference", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Stop sound", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop sound", exact: true }).click();
  await page.getByLabel("Language", { exact: true }).selectOption("sr-Latn");
  await expect(
    page.getByRole("heading", { name: "Otkucaj sving" }),
  ).toBeVisible();
  await expect(page.getByLabel("Šta čuješ?")).toHaveValue(
    "Leave a little more space.",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Soba za vežbanje", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: /Slušaj Pusti poziv/ }),
  ).toBeChecked();
  await expect(page.getByLabel("Šta čuješ?")).toHaveValue(
    "Leave a little more space.",
  );
  expect(privateRequests).toEqual([]);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { learningMicRequests: number })
          .learningMicRequests,
    ),
  ).toBe(0);
});

test("studio controls stop playback, persist edits and round-trip the backup", async ({
  page,
}) => {
  await page.goto("/learn/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Loop studio", exact: true })
    .click();
  const step = page.getByRole("button", {
    name: "Low drum, step 2",
    exact: true,
  });
  await expect(step).toHaveAttribute("aria-pressed", "false");
  await step.click();
  await page.getByRole("button", { name: "Play loop", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop sound", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("slider", { name: "Tempo", exact: true })
    .press("ArrowRight");
  await expect(
    page.getByRole("button", { name: "Play loop", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "My progress", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download practice backup", exact: true })
    .click();
  const path = await (await downloaded).path();
  if (!path) throw new Error("Backup was not downloaded");
  await page
    .getByLabel("Restore practice backup", { exact: true })
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":99}'),
    });
  await expect(page.getByRole("status")).toContainText("not a compatible");
  await page
    .getByLabel("Restore practice backup", { exact: true })
    .setInputFiles(path);
  await expect(page.getByRole("status")).toContainText(
    "Practice backup restored",
  );
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Loop studio", exact: true })
    .click();
  await expect(step).toHaveAttribute("aria-pressed", "true");
});

test("all levels remain accessible on a small screen and the full-engine link resolves", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/learn");
  await page
    .getByLabel("Starting level", { exact: true })
    .selectOption("advanced");
  await expect(
    page.getByRole("heading", { name: "Move the motive" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Continue practice", exact: true })
    .click();
  const engineLink = page
    .getByRole("link", { name: "Open full engine", exact: true })
    .last();
  await expect(engineLink).toHaveAttribute(
    "href",
    "/?mode=etude&bpm=104&path=path-2",
  );
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Loop studio", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto("/?mode=etude&bpm=104&path=path-2");
  await expect(
    page.getByRole("link", { name: /Ultimate Exercise · Learning paths/ }),
  ).toBeVisible();
  await expect(page.getByTestId("learning-surface")).toHaveCount(0);
});

test("storage failure leaves practice usable and offers a downloadable backup", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Storage unavailable", "QuotaExceededError");
    };
  });
  await page.goto("/learn");
  await expect(page.getByText(/Storage is unavailable/)).toBeVisible();
  await page
    .getByRole("button", { name: "Continue practice", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /Listen Play the call/ }).check();
  await page.getByLabel("What did you hear?").fill("Keep this take in mind.");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download practice backup", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "ultimate-exercise-practice.json",
  );
  await expect(page.getByLabel("What did you hear?")).toHaveValue(
    "Keep this take in mind.",
  );
});
