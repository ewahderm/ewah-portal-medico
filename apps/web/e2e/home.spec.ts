import { test, expect } from "@playwright/test";

test("la home carga sin errores", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/.+/);
});
