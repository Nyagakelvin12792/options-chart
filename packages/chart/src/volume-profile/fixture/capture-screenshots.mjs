import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const fixtureDir = path.resolve("packages/chart/src/volume-profile/fixture");
const screenshotDir = path.resolve(fixtureDir, "screenshots");

const server = http.createServer((req, res) => {
  let reqPath = req.url.split("?")[0];
  if (reqPath === "/") reqPath = "/harness.html";
  const filePath = path.join(fixtureDir, reqPath);

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  const ext = path.extname(filePath);
  const mimeTypes = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
  };

  res.writeHead(200, { "Content-Type": mimeTypes[ext] || "text/plain" });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(0, "127.0.0.1", async () => {
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/harness.html`;
  console.log(`[Fixture Server] Running on ${url}`);

  const browser = await chromium.launch({ headless: true });

  try {
    // 1. Desktop 1440x900
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const desktopPage = await desktopContext.newPage();
    await desktopPage.goto(url, { waitUntil: "networkidle" });

    await desktopPage.waitForSelector("#chart-container canvas");
    await desktopPage.waitForFunction(() => {
      const poc = document.getElementById("stat-poc")?.textContent;
      return poc && poc !== "-";
    });

    const shot1 = path.join(screenshotDir, "desktop-1440x900-right.png");
    await desktopPage.screenshot({ path: shot1, fullPage: true });
    console.log(`[Screenshot] Saved: ${shot1}`);

    // Toggle Left alignment
    await desktopPage.click("#btn-placement");
    await desktopPage.waitForTimeout(300);
    const shot2 = path.join(screenshotDir, "desktop-1440x900-left.png");
    await desktopPage.screenshot({ path: shot2, fullPage: true });
    console.log(`[Screenshot] Saved: ${shot2}`);

    // Toggle Replay mode
    await desktopPage.click("#btn-replay");
    await desktopPage.waitForTimeout(300);
    const shot3 = path.join(screenshotDir, "desktop-1440x900-replay.png");
    await desktopPage.screenshot({ path: shot3, fullPage: true });
    console.log(`[Screenshot] Saved: ${shot3}`);

    await desktopContext.close();

    // 2. Mobile 390x844
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(url, { waitUntil: "networkidle" });
    await mobilePage.waitForSelector("#chart-container canvas");

    // Click mobile button to resize chart frame
    await mobilePage.click("#btn-mobile");
    await mobilePage.waitForTimeout(400);

    const shot4 = path.join(screenshotDir, "mobile-390x844-right.png");
    await mobilePage.screenshot({ path: shot4, fullPage: true });
    console.log(`[Screenshot] Saved: ${shot4}`);

    await mobileContext.close();
  } catch (err) {
    console.error("[Screenshot Error]", err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
});
