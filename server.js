import cron from "node-cron";
import { scrapeLinkedInJobs } from "./scrapers/linkedin.js";
import { scrapeNaukriJobs } from "./scrapers/naukri.js";
import { scrapeIndeedJobs } from "./scrapers/indeed.js";
import { filterNewJobs } from "./services/filterJobs.js";
import { sendJobEmail } from "./services/mailer.js";

async function runJobAlert() {
  try {
    console.log("🔎 Checking new jobs...");

    const linkedinJobs = await scrapeLinkedInJobs();
    const naukriJobs = await scrapeNaukriJobs();
    const indeedJobs = await scrapeIndeedJobs();

    const allJobs = [
      ...linkedinJobs,
      ...naukriJobs,
      ...indeedJobs
    ];

    console.log(`📊 Total jobs found: ${allJobs.length}`);

    const newJobs = filterNewJobs(allJobs);

    if (newJobs.length > 0) {
      console.log(`📧 Sending ${newJobs.length} new jobs...`);
      await sendJobEmail(newJobs);
    } else {
      console.log("😴 No new jobs found");
    }

  } catch (error) {
    console.error("❌ Error running job alert:", error);
  }
}

/*
⏰ CRON SCHEDULE (FINAL)

Runs EVERY HOUR from 8 AM → 12 PM
8:00 AM
9:00 AM
10:00 AM
11:00 AM
12:00 PM
*/

cron.schedule("0 8-12 * * *", runJobAlert);

console.log("🚀 Job Alert MCP Server Started...");