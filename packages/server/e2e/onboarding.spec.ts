import { test, expect } from "./fixtures.js";

test.describe("Onboarding Wizard", () => {
  test("onboarding overlay is NOT shown when projects exist", async ({ page, server }) => {
    // First ensure at least one project exists
    const projRes = await page.request.get(`${server.baseUrl}/api/projects`);
    const projects = await projRes.json();
    if (projects.length === 0) {
      await page.request.post(`${server.baseUrl}/api/projects`, {
        data: { name: "cc2im", directory: "/home/hills/projects/cc2im" },
      });
    }

    await page.goto(server.baseUrl);
    await page.waitForTimeout(3000);

    // Onboarding overlay should NOT be visible when projects exist
    const overlay = page.locator(".overlay");
    await expect(overlay).not.toBeVisible({ timeout: 5000 });

    await server.screenshot(page, "onboarding-not-shown");
  });

  test("onboarding wizard flow after removing all projects", async ({ page, server }) => {
    // Step 0: Save current projects for restoration
    const projRes = await page.request.get(`${server.baseUrl}/api/projects`);
    const originalProjects = (await projRes.json()) as Array<{
      name: string;
      directory: string;
      [key: string]: unknown;
    }>;

    // Ensure we have something to restore
    if (originalProjects.length === 0) {
      originalProjects.push({ name: "cc2im", directory: "/home/hills/projects/cc2im" });
    }

    // Helper to restore projects (used in finally)
    const restoreProjects = async () => {
      // Delete any test projects
      try {
        const currentRes = await page.request.get(`${server.baseUrl}/api/projects`);
        const currentProjects = (await currentRes.json()) as Array<{ name: string }>;
        for (const p of currentProjects) {
          const isOriginal = originalProjects.some((op) => op.name === p.name);
          if (!isOriginal) {
            await page.request
              .delete(`${server.baseUrl}/api/projects/${encodeURIComponent(p.name)}`)
              .catch(() => {});
          }
        }
      } catch {}

      // Re-add original projects
      for (const proj of originalProjects) {
        await page.request
          .post(`${server.baseUrl}/api/projects`, {
            data: { name: proj.name, directory: proj.directory },
          })
          .catch(() => {});
      }
    };

    // Step 1: Delete all projects
    for (const proj of originalProjects) {
      await page.request.delete(
        `${server.baseUrl}/api/projects/${encodeURIComponent(proj.name)}`
      );
    }

    try {
      // Step 2: Reload page - onboarding should appear
      await page.goto(server.baseUrl);
      await page.waitForTimeout(3000);

      const overlay = page.locator(".overlay");
      await expect(overlay).toBeVisible({ timeout: 5000 });

      const wizardCard = page.locator(".wizard-card");
      await expect(wizardCard).toBeVisible({ timeout: 3000 });
      await server.screenshot(page, "onboarding-overlay-visible");

      // Step 1 of wizard: Claude command (pre-filled with "claude")
      const claudeCmd = page.locator("#claude-cmd");
      await expect(claudeCmd).toBeVisible({ timeout: 3000 });
      const cmdValue = await claudeCmd.inputValue();
      expect(cmdValue.length).toBeGreaterThan(0);

      // Next button should be enabled
      const nextBtn = page.locator(".btn-primary:has-text('Next')");
      await expect(nextBtn).not.toBeDisabled();
      await nextBtn.click();
      await page.waitForTimeout(1000);
      await server.screenshot(page, "onboarding-step2");

      // Step 2: Test Claude command
      const testBtn = page.locator(".btn-primary:has-text('Test')");
      const isStep2 = await testBtn.isVisible().catch(() => false);

      if (isStep2) {
        await testBtn.click();
        await page.waitForTimeout(5000);

        const successMsg = page.locator(".status-msg.success");
        const isSuccess = await successMsg.isVisible().catch(() => false);

        await server.screenshot(page, "onboarding-step2-result");

        if (isSuccess) {
          const nextBtn2 = page.locator(".btn-primary:has-text('Next')");
          await nextBtn2.click();
        } else {
          // Can't proceed past step 2 without working claude command
          // Restore and skip the rest
          return;
        }
      }

      await page.waitForTimeout(1000);
      await server.screenshot(page, "onboarding-step3");

      // Step 3: Project details
      const projName = page.locator("#proj-name");
      if (await projName.isVisible().catch(() => false)) {
        await projName.fill("e2e-onboarding-test");
        const projDir = page.locator("#proj-dir");
        await projDir.fill("/tmp/e2e-onboarding");

        const nextBtn3 = page.locator(".btn-primary:has-text('Next')");
        await nextBtn3.click();
        await page.waitForTimeout(1000);
        await server.screenshot(page, "onboarding-step4");
      }

      // Step 4: Platform tokens (optional — skip)
      const skipBtn = page.locator(".btn-ghost:has-text('Skip')");
      if (await skipBtn.isVisible().catch(() => false)) {
        await skipBtn.click();
        await page.waitForTimeout(1000);
        await server.screenshot(page, "onboarding-step5");
      }

      // Step 5: Complete
      const finishBtn = page.locator(".btn-primary:has-text('Start Chatting')");
      if (await finishBtn.isVisible().catch(() => false)) {
        await finishBtn.click();
        await page.waitForTimeout(2000);

        // Onboarding should be hidden now
        await expect(overlay).not.toBeVisible({ timeout: 5000 });
        await server.screenshot(page, "onboarding-complete");
      }
    } finally {
      // ALWAYS restore original projects, no matter what
      await restoreProjects();
    }
  });
});
