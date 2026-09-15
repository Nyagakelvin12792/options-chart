import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const fixtureDir = path.resolve("packages/chart/src/anchored-vwap/fixture");
const screenshotDir = path.resolve(fixtureDir, "screenshots");

if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

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
    // 1. Desktop 1440x900 Default View
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const desktopPage = await desktopContext.newPage();
    await desktopPage.goto(url, { waitUntil: "networkidle" });

    await desktopPage.waitForSelector("#chart-container canvas");
    await desktopPage.waitForFunction(() => {
      const vwap = document.getElementById("stat-vwap")?.textContent;
      return vwap && vwap !== "-";
    });

    const shot1 = path.join(screenshotDir, "desktop-1440x900-default.png");
    await desktopPage.screenshot({ path: shot1, fullPage: true });
    console.log(`[Screenshot] Saved: ${shot1}`);

    // 2. Select Swing High Anchor (Candle 80)
    await desktopPage.selectOption("#sel-anchor", "80");
    await desktopPage.waitForTimeout(400);
    const shot2 = path.join(screenshotDir, "desktop-1440x900-swing-high.png");
    await desktopPage.screenshot({ path: shot2, fullPage: true });
    console.log(`[Screenshot] Saved: ${shot2}`);

    // 3. Reset Anchor to 0 and Toggle Replay mode
    await desktopPage.selectOption("#sel-anchor", "0");
    await desktopPage.waitForTimeout(300);
    await desktopPage.click("#btn-replay");
    await desktopPage.waitForTimeout(400);
    const shot3 = path.join(screenshotDir, "desktop-1440x900-replay.png");
    await desktopPage.screenshot({ path: shot3, fullPage: true });
    console.log(`[Screenshot] Saved: ${shot3}`);

    await desktopContext.close();

    // 4. Mobile 390x844
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

    const shot4 = path.join(screenshotDir, "mobile-390x844-default.png");
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
