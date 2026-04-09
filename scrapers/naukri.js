import puppeteer from "puppeteer";

export async function scrapeNaukriJobs() {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  const url =
    "https://www.naukri.com/frontend-developer-fresher-jobs-in-tamil-nadu";

  await page.goto(url, { waitUntil: "networkidle2" });

  // Wait job cards load
  await page.waitForSelector(".jobTuple");

  const jobs = await page.evaluate(() => {
    const jobCards = document.querySelectorAll(".jobTuple");
    let results = [];

    jobCards.forEach(card => {
      const title = card.querySelector(".title")?.innerText;
      const company = card.querySelector(".comp-name")?.innerText;
      const location = card.querySelector(".locWdth")?.innerText;
      const link = card.querySelector("a.title")?.href;

      if (title && company && link) {
        results.push({
          title,
          company,
          location,
          link
        });
      }
    });

    return results;
  });

  await browser.close();
  return jobs;
}