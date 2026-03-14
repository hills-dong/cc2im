import { test, expect } from "./fixtures.js";

test.describe("Onboarding Wizard", () => {
  test("shows onboarding overlay when no projects exist", async ({ page, server }) => {
    await page.goto(`http://127.0.0.1:${server.port}/`);

    // The Onboarding component uses class "overlay"
    const onboarding = page.locator(".overlay");
    await expect(onboarding).toBeVisible({ timeout: 5000 });
  });

  test("does not show onboarding when projects exist", async ({ page, server }) => {
    // Seed a project first
    await fetch(`http://127.0.0.1:${server.port}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "existing-proj", directory: "/tmp/existing" }),
    });

    await page.goto(`http://127.0.0.1:${server.port}/`);
    await page.waitForTimeout(2000);

    const onboarding = page.locator(".overlay");
    await expect(onboarding).toBeHidden();
  });

  test("onboarding step 1 validates claude command input", async ({ page, server }) => {
    await page.goto(`http://127.0.0.1:${server.port}/`);

    const onboarding = page.locator(".overlay");
    await expect(onboarding).toBeVisible({ timeout: 5000 });

    // Step 1 should have a text input for claude command (pre-filled with "claude")
    const claudeInput = page.locator(".overlay input[type='text']").first();
    await expect(claudeInput).toBeVisible();

    // Should have a value pre-filled
    const value = await claudeInput.inputValue();
    expect(value).toBeTruthy();
  });
});
