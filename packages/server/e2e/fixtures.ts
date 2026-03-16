import { test as base, expect } from "@playwright/test";
import { mkdirSync } from "fs";
import { join } from "path";

const SCREENSHOTS_DIR = join(import.meta.dirname ?? ".", "../e2e-screenshots");

// Real environment: connect to already-running server at port 8081
const BASE_URL = "http://127.0.0.1:8081";

export interface ServerFixture {
  port: number;
  baseUrl: string;
  dbPath: string;
  /** Save a screenshot with a descriptive name */
  screenshot: (page: import("@playwright/test").Page, name: string) => Promise<void>;
}

let counter = 0;

export const test = base.extend<{ server: ServerFixture }>({
  server: async ({}, use) => {
    mkdirSync(SCREENSHOTS_DIR, { recursive: true });

    const screenshot = async (page: import("@playwright/test").Page, name: string) => {
      counter++;
      const filename = `${String(counter).padStart(3, "0")}-${name}.png`;
      await page.screenshot({ path: join(SCREENSHOTS_DIR, filename), fullPage: true });
    };

    await use({
      port: 8081,
      baseUrl: BASE_URL,
      dbPath: "", // real DB, don't expose path
      screenshot,
    });
  },
});

export { expect };
