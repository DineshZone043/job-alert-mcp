import puppeteer from "puppeteer";

export async function scrapeIndeedJobs() {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  const url =
    "https://in.indeed.com/jobs?q=frontend+developer+fresher+react&l=Tamil+Nadu";

  await page.goto(url, { waitUntil: "networkidle2" });

  await page.waitForSelector(".job_seen_beacon");

  const jobs = await page.evaluate(() => {
    const jobCards = document.querySelectorAll(".job_seen_beacon");
    let results = [];

    jobCards.forEach(card => {
      const title = card.querySelector("h2 a span")?.innerText;
      const company = card.querySelector('[data-testid="company-name"]')?.innerText;
      const location = card.querySelector('[data-testid="text-location"]')?.innerText;
      const link = card.querySelector("h2 a")?.href;

      if (title && company && link) {
        results.push({
          title,
          company,
          location,
          link: "https://in.indeed.com" + link
        });
      }
    });

    return results;
  });

  await browser.close();
  return jobs;
}