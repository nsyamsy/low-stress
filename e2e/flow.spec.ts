import { expect, test } from "@playwright/test";

const E2E_ADMIN_USERNAME = "e2e_superadmin";
const E2E_ADMIN_PASSWORD = "E2eSuperAdminPass123!";

test.describe("D-15, D-09 & D-10: End-to-End & Multi-Viewport Visual QA", () => {
  test("D-15 (360px Mobile, Bahasa Indonesia): daftar -> pending -> admin setujui -> login -> beranda menampilkan game -> profil ubah tema -> keluar", async ({
    browser,
  }) => {
    const suffix = `${Date.now().toString(36)}m`;
    const username = `u_${suffix}`;
    const displayName = `Pemain Mobile ${suffix}`;
    const email = `${username}@example.test`;
    const password = "PlayerSecretPass123!";

    // 1. Konteks Pemain di 360x640 (Bahasa Indonesia)
    const playerContext = await browser.newContext({
      viewport: { width: 360, height: 640 },
      locale: "id-ID",
    });
    const page = await playerContext.newPage();

    await page.goto("/register");
    await page.getByRole("button", { name: "Indonesia" }).click();

    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Nama tampilan").fill(displayName);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Daftar" }).click();

    // Diarahkan ke /pending
    await expect(page).toHaveURL(/\/pending$/);
    await expect(
      page.getByRole("heading", { name: "Menunggu persetujuan" }),
    ).toBeVisible();

    // Keluar dari sesi pending agar setelah disetujui dapat login bersih sesuai alur D-15
    await page.getByRole("button", { name: "Keluar" }).click();
    await expect(page).toHaveURL(/\/login$/);

    // 2. Konteks Admin menyetujui pendaftaran pemain
    const adminContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: "id-ID",
    });
    const adminPage = await adminContext.newPage();

    await adminPage.goto("/admin/login");
    await adminPage.getByLabel("Username admin").fill(E2E_ADMIN_USERNAME);
    await adminPage.getByLabel("Password").fill(E2E_ADMIN_PASSWORD);
    await adminPage.getByRole("button", { name: "Masuk sebagai admin" }).click();

    await expect(adminPage).toHaveURL(/\/admin$/);
    await adminPage.goto("/admin/approvals");

    const userRow = adminPage.locator("tr", { hasText: username });
    await expect(userRow).toBeVisible();
    await userRow.getByRole("button", { name: "Setujui" }).click();
    await expect(adminPage.locator("tr", { hasText: username })).toHaveCount(0);

    await adminContext.close();

    // 3. Pemain login kembali di 360px -> Beranda menampilkan game & thumbnail
    await page.goto("/login");
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.locator("form").getByRole("button", { name: "Masuk" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("heading", { name: new RegExp(displayName) }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Flappy Bird" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Memory Match" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ludo" })).toBeVisible();
    await expect(page.locator("img.ls-game-card__thumb").first()).toBeVisible();

    // Pastikan tidak ada overflow horizontal di 360px
    const overflow360 = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow360).toBe(false);

    // 4. Profil ubah tema (Terang -> Gelap) -> Keluar
    await page.goto("/profile");
    await expect(
      page.getByRole("heading", { name: displayName }),
    ).toBeVisible();

    const mainSection = page.locator("#main-content");
    await mainSection.getByRole("button", { name: "Gelap" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await mainSection.getByRole("button", { name: "Terang" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await mainSection.getByRole("button", { name: "Keluar" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await playerContext.close();
  });

  test("D-15 (1280px Desktop, English): register -> pending -> admin approves -> login -> home shows games -> profile theme switch -> logout", async ({
    browser,
  }) => {
    const suffix = `${Date.now().toString(36)}d`;
    const username = `u_${suffix}`;
    const displayName = `Desktop Player ${suffix}`;
    const email = `${username}@example.test`;
    const password = "PlayerSecretPass123!";

    const playerContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: "en-US",
    });
    const page = await playerContext.newPage();

    await page.goto("/register");
    await page.getByRole("button", { name: "English" }).click();

    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Display name").fill(displayName);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(page).toHaveURL(/\/pending$/);
    await expect(
      page.getByRole("heading", { name: "Pending approval" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    // Admin menyetujui
    const adminContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: "en-US",
    });
    const adminPage = await adminContext.newPage();

    await adminPage.goto("/admin/login");
    await adminPage.getByLabel("Admin username").fill(E2E_ADMIN_USERNAME);
    await adminPage.getByLabel("Password").fill(E2E_ADMIN_PASSWORD);
    await adminPage.getByRole("button", { name: "Log in as admin" }).click();

    await expect(adminPage).toHaveURL(/\/admin$/);
    await adminPage.goto("/admin/approvals");

    const userRow = adminPage.locator("tr", { hasText: username });
    await expect(userRow).toBeVisible();
    await userRow.getByRole("button", { name: "Approve" }).click();
    await expect(adminPage.locator("tr", { hasText: username })).toHaveCount(0);
    await adminContext.close();

    // Pemain login dalam Bahasa Inggris
    await page.goto("/login");
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.locator("form").getByRole("button", { name: "Log in" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("heading", { name: new RegExp(displayName) }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Flappy Bird" }),
    ).toBeVisible();

    await page.goto("/profile");
    const mainSection = page.locator("#main-content");
    await mainSection.getByRole("button", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await mainSection.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await playerContext.close();
  });

  test("D-09 & D-10: QA visual seluruh halaman Admin dan Pemain di 360px/390px/768px/1280px (terang & gelap)", async ({
    browser,
  }) => {
    // 1. Pemeriksaan seluruh halaman Admin (/admin/*) di 360px, 768px, 1280px (terang & gelap)
    const adminContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: "id-ID",
    });
    const adminPage = await adminContext.newPage();

    await adminPage.goto("/admin/login");
    await adminPage.getByLabel("Username admin").fill(E2E_ADMIN_USERNAME);
    await adminPage.getByLabel("Password").fill(E2E_ADMIN_PASSWORD);
    await adminPage.getByRole("button", { name: "Masuk sebagai admin" }).click();
    await expect(adminPage).toHaveURL(/\/admin$/);

    const adminRoutes = [
      "/admin",
      "/admin/approvals",
      "/admin/users",
      "/admin/games",
      "/admin/leaderboard",
      "/admin/chat",
      "/admin/ludo",
      "/admin/riot",
      "/admin/settings",
      "/admin/audit",
    ];

    for (const width of [360, 768, 1280]) {
      await adminPage.setViewportSize({ width, height: 800 });
      for (const theme of ["light", "dark"] as const) {
        await adminPage.evaluate((t) => {
          document.documentElement.dataset.theme = t;
        }, theme);

        for (const route of adminRoutes) {
          await adminPage.goto(route);
          await expect(adminPage.locator("#admin-main-content")).toBeVisible();

          const hasHorizontalOverflow = await adminPage.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth + 1,
          );
          expect(
            hasHorizontalOverflow,
            `Tidak boleh overflow horizontal pada ${route} (${width}px, ${theme})`,
          ).toBe(false);
        }
      }
    }

    await adminContext.close();

    // 2. Pemeriksaan halaman Pemain & Ketiga Game di 360px, 390px, 768px, 1280px
    const suffix = `${Date.now().toString(36)}q`;
    const username = `u_${suffix}`;
    const password = "PlayerSecretPass123!";

    const qaContext = await browser.newContext({
      viewport: { width: 360, height: 640 },
      locale: "id-ID",
    });
    const qaPage = await qaContext.newPage();

    await qaPage.goto("/register");
    await qaPage.getByLabel("Username").fill(username);
    await qaPage.getByLabel("Nama tampilan").fill("Pemain QA");
    await qaPage.getByLabel("Email").fill(`${username}@example.test`);
    await qaPage.getByLabel("Password", { exact: true }).fill(password);
    await qaPage.getByRole("button", { name: "Daftar" }).click();

    // Setujui via konteks admin singkat
    const approveCtx = await browser.newContext({ locale: "id-ID" });
    const approvePage = await approveCtx.newPage();
    await approvePage.goto("/admin/login");
    await approvePage.getByLabel("Username admin").fill(E2E_ADMIN_USERNAME);
    await approvePage.getByLabel("Password").fill(E2E_ADMIN_PASSWORD);
    await approvePage.getByRole("button", { name: "Masuk sebagai admin" }).click();
    await approvePage.goto("/admin/approvals");
    await approvePage
      .locator("tr", { hasText: username })
      .getByRole("button", { name: "Setujui" })
      .click();
    await approveCtx.close();

    // Muat ulang pemain untuk masuk ke beranda
    await qaPage.goto("/");
    await expect(
      qaPage.getByRole("heading", { name: "Flappy Bird" }),
    ).toBeVisible();

    const playerRoutes = [
      "/",
      "/leaderboard",
      "/profile",
      "/games/memory-match",
      "/games/flappy-bird",
      "/games/ludo",
    ];

    for (const vp of [
      { width: 360, height: 640 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1280, height: 800 },
    ]) {
      await qaPage.setViewportSize(vp);
      for (const route of playerRoutes) {
        await qaPage.goto(route);
        await expect(qaPage.locator("#main-content")).toBeVisible();

        const hasOverflow = await qaPage.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth + 1,
        );
        expect(
          hasOverflow,
          `Tidak boleh overflow horizontal pada ${route} (${vp.width}x${vp.height})`,
        ).toBe(false);
      }
    }

    await qaContext.close();
  });
});
