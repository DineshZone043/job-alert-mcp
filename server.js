// server.js — ES Module, runs once and exits cleanly

import puppeteer from 'puppeteer';
import nodemailer from 'nodemailer';
import 'dotenv/config';

// ─── CONFIG ───────────────────────────────────────────────
const CONFIG = {
  keywords: ['React Developer', 'Frontend Developer', 'React.js'],
  location: 'Chennai',
  experience: 'fresher',
};

// ─── LOGGING HELPER ───────────────────────────────────────
const log = (stage, data) => {
  const count = Array.isArray(data) ? data.length : '—';
  console.log(`\n[PIPELINE][${stage}] → ${count} items`);
  if (Array.isArray(data) && data.length === 0) {
    console.error(`[ALERT][${stage}] ⚠️  EMPTY — data lost at this stage!`);
  }
  if (Array.isArray(data) && data.length > 0) {
    console.log(`[PIPELINE][${stage}] Sample:`, JSON.stringify(data[0], null, 2));
  }
};

// ─── BROWSER FACTORY ──────────────────────────────────────
async function createBrowser() {
  return puppeteer.launch({
    headless: true,
    // ✅ Required for GitHub Actions Ubuntu runners
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',   // avoids /dev/shm size limit crashes
      '--disable-gpu',
      '--window-size=1280,800',
    ],
    // Explicitly set the path that `npx puppeteer browsers install chrome` puts it
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  });
}

// ─── SCRAPER ──────────────────────────────────────────────
async function scrapeNaukri(browser, keyword, location) {
  const page = await browser.newPage();
  const jobs = [];

  try {
    // Set a real user-agent — critical to avoid blocks
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
    });

    const url = `https://www.naukri.com/${keyword.toLowerCase().replace(/ /g, '-')}-jobs-in-${location.toLowerCase()}`;
    console.log(`[SCRAPER] Fetching: ${url}`);

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // ── Check if we got blocked ──────────────────────────
    const pageTitle = await page.title();
    console.log(`[SCRAPER] Page title: "${pageTitle}"`);

    if (pageTitle.toLowerCase().includes('login') ||
        pageTitle.toLowerCase().includes('captcha') ||
        pageTitle.toLowerCase().includes('access denied')) {
      console.error('[SCRAPER] ⚠️  BLOCKED — Got login/captcha page instead of jobs!');
      await page.close();
      return [];
    }

    // ── Wait for job cards to load ───────────────────────
    await page.waitForSelector('.srp-jobtuple-wrapper, .jobTuple', {
      timeout: 15000,
    }).catch(() => {
      console.error('[SCRAPER] ⚠️  Job card selector not found — HTML structure may have changed!');
    });

    // ── Extract job data ─────────────────────────────────
    const extracted = await page.evaluate(() => {
      const cards = document.querySelectorAll('.srp-jobtuple-wrapper, .jobTuple');
      console.log(`[PAGE] Found ${cards.length} raw cards`);

      return Array.from(cards).map(card => ({
        title:    card.querySelector('.title, [class*="title"]')?.innerText?.trim() || '',
        company:  card.querySelector('.comp-name, [class*="comp"]')?.innerText?.trim() || '',
        location: card.querySelector('.loc-wrap, [class*="location"]')?.innerText?.trim() || '',
        experience: card.querySelector('.exp-wrap, [class*="experience"]')?.innerText?.trim() || '',
        link:     card.querySelector('a.title, a[class*="title"]')?.href || '',
      }));
    });

    jobs.push(...extracted);

  } catch (err) {
    console.error(`[SCRAPER] Error scraping Naukri:`, err.message);
  } finally {
    await page.close();
  }

  return jobs;
}

// ─── FILTER ───────────────────────────────────────────────
function filterJobs(jobs) {
  // ✅ Relaxed matching — avoids over-filtering to zero
  return jobs.filter(job => {
    if (!job.title) return false;

    const title = job.title.toLowerCase();
    const loc   = job.location.toLowerCase();
    const exp   = job.experience.toLowerCase();

    const titleMatch = (
      title.includes('react') ||
      title.includes('frontend') ||
      title.includes('front-end') ||
      title.includes('front end') ||
      title.includes('javascript') ||
      title.includes('js developer')
    );

    const locationMatch = (
      loc.includes('chennai') ||
      loc.includes('remote') ||
      loc.includes('work from home') ||
      loc === ''  // missing location = don't discard
    );

    const expMatch = (
      exp.includes('0') ||
      exp.includes('fresher') ||
      exp.includes('entry') ||
      exp === ''  // missing exp = don't discard
    );

    return titleMatch && locationMatch && expMatch;
  });
}

// ─── EMAIL ────────────────────────────────────────────────
function buildEmailHTML(jobs) {
  if (jobs.length === 0) {
    return `
      <h2>Job Alert Bot</h2>
      <p style="color:red;">
        ⚠️ No jobs found today. This may mean LinkedIn/Naukri blocked the scraper,
        or no fresh listings match your filters.
      </p>`;
  }

  const rows = jobs.map((j, i) => `
    <tr style="background:${i % 2 === 0 ? '#f9f9f9' : '#fff'}">
      <td style="padding:8px;border:1px solid #ddd;">
        <a href="${j.link}" style="color:#1a73e8;text-decoration:none;">${j.title}</a>
      </td>
      <td style="padding:8px;border:1px solid #ddd;">${j.company}</td>
      <td style="padding:8px;border:1px solid #ddd;">${j.location}</td>
      <td style="padding:8px;border:1px solid #ddd;">${j.experience}</td>
    </tr>
  `).join('');

  return `
    <h2 style="color:#333;">🔔 Job Alert — ${new Date().toLocaleDateString('en-IN')}</h2>
    <p>Found <strong>${jobs.length}</strong> matching jobs for you today:</p>
    <table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:14px;">
      <thead>
        <tr style="background:#1a73e8;color:#fff;">
          <th style="padding:10px;text-align:left;">Role</th>
          <th style="padding:10px;text-align:left;">Company</th>
          <th style="padding:10px;text-align:left;">Location</th>
          <th style="padding:10px;text-align:left;">Experience</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="font-size:12px;color:#999;margin-top:20px;">
      Sent by Job Alert Bot • DineshZone043/job-alert-mcp
    </p>`;
}

async function sendEmail(jobs) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const html = buildEmailHTML(jobs);
  console.log(`[EMAIL] HTML body length: ${html.length} chars`);

  await transporter.sendMail({
    from:    `"Job Alert Bot" <${process.env.EMAIL_USER}>`,
    to:      process.env.EMAIL_USER,
    subject: `🔔 ${jobs.length} React/Frontend Jobs — ${new Date().toLocaleDateString('en-IN')}`,
    html,
  });
// Add inside sendEmail() before dispatching:
if (jobs.length === 0) {
  console.error('[ALERT] 0 jobs found — possible causes:');
  console.error('  1. Naukri/LinkedIn blocked this GitHub Actions IP');
  console.error('  2. Selectors changed (site updated HTML)');
  console.error('  3. Filters too strict');
  // Still send email so you get notified, not silently skipped
}
  console.log(`[EMAIL] ✅ Sent successfully with ${jobs.length} jobs.`);
}

// ─── MAIN (runs once and exits) ───────────────────────────
async function main() {
  console.log('='.repeat(50));
  console.log('[BOT] Job Alert Bot started at', new Date().toISOString());
  console.log('='.repeat(50));

  const browser = await createBrowser();
  let allJobs = [];

  try {
    // Scrape for each keyword
    for (const keyword of CONFIG.keywords) {
      const scraped = await scrapeNaukri(browser, keyword, CONFIG.location);
      log(`SCRAPE_${keyword}`, scraped);
      allJobs.push(...scraped);
    }

    // Deduplicate by link
    const seen = new Set();
    allJobs = allJobs.filter(j => {
      if (!j.link || seen.has(j.link)) return false;
      seen.add(j.link);
      return true;
    });
    log('AFTER_DEDUPE', allJobs);

    // Filter
    const filtered = filterJobs(allJobs);
    log('AFTER_FILTER', filtered);

    // Email
    await sendEmail(filtered);

  } catch (err) {
    console.error('[BOT] Fatal error:', err);
    process.exit(1);

  } finally {
    await browser.close();
    console.log('[BOT] Browser closed. Pipeline complete.');
  }
}

// ✅ No node-cron here — GitHub Actions handles scheduling
main();