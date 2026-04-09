import puppeteer from "puppeteer";

export async function scrapeLinkedInJobs() {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  const url =
    "https://www.linkedin.com/jobs/search/?keywords=Frontend%20Developer%20Fresher%20React%20Developer&location=Tamil%20Nadu";

  await page.goto(url, { waitUntil: "networkidle2" });
  await page.waitForSelector(".base-search-card");

  const jobs = await page.evaluate(() => {
    const jobCards = document.querySelectorAll(".base-search-card");
    let results = [];

    jobCards.forEach(card => {
      const title = card.querySelector("h3")?.innerText;
      const company = card.querySelector("h4")?.innerText;
      const link = card.querySelector("a")?.href;
      const location = card.querySelector(".job-search-card__location")?.innerText;

      if (title && company) {
        results.push({ title, company, link, location });
      }
    });

    return results;
  });

  await browser.close();
  return jobs;
}