// server.js — ES Module, runs once and exits cleanly

import puppeteer from 'puppeteer';
import nodemailer from 'nodemailer';
import 'dotenv/config';

// ─── CONFIG ───────────────────────────────────────────────
const CONFIG = {
  keywords: ['React Developer', 'Frontend Developer', 'React.js'],
  location: 'Chennai',
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
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,800',
    ],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  });
}

// ─── SCRAPER 1: NAUKRI (Puppeteer) ────────────────────────
async function scrapeNaukri(browser, keyword, location) {
  const page = await browser.newPage();
  const jobs = [];

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

    const url = `https://www.naukri.com/${keyword.toLowerCase().replace(/ /g, '-')}-jobs-in-${location.toLowerCase()}`;
    console.log(`[NAUKRI] Fetching: ${url}`);

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    const pageTitle = await page.title();
    console.log(`[NAUKRI] Page title: "${pageTitle}"`);

    if (
      pageTitle.toLowerCase().includes('login') ||
      pageTitle.toLowerCase().includes('captcha') ||
      pageTitle.toLowerCase().includes('access denied')
    ) {
      console.error('[NAUKRI] ⚠️  BLOCKED — Got login/captcha page!');
      await page.close();
      return [];
    }

    await page.waitForSelector('.srp-jobtuple-wrapper, .jobTuple', {
      timeout: 15000,
    }).catch(() => {
      console.error('[NAUKRI] ⚠️  Selector not found — HTML may have changed!');
    });

    const extracted = await page.evaluate(() => {
      const cards = document.querySelectorAll('.srp-jobtuple-wrapper, .jobTuple');
      return Array.from(cards).map(card => ({
        title:      card.querySelector('.title, [class*="title"]')?.innerText?.trim() || '',
        company:    card.querySelector('.comp-name, [class*="comp"]')?.innerText?.trim() || '',
        location:   card.querySelector('.loc-wrap, [class*="location"]')?.innerText?.trim() || '',
        experience: card.querySelector('.exp-wrap, [class*="experience"]')?.innerText?.trim() || '',
        link:       card.querySelector('a.title, a[class*="title"]')?.href || '',
        source:     'Naukri',
      }));
    });

    jobs.push(...extracted);

  } catch (err) {
    console.error(`[NAUKRI] Error:`, err.message);
  } finally {
    await page.close();
  }

  return jobs;
}

// ─── SCRAPER 2: ADZUNA (API — no IP block) ────────────────
//     ✅ Paste your Adzuna function HERE, between Naukri and Filter
async function scrapeAdzuna(keyword) {
  const appId  = process.env.ADZUNA_APP_ID;
  const apiKey = process.env.ADZUNA_API_KEY;

  if (!appId || !apiKey) {
    console.error('[ADZUNA] ⚠️  Missing ADZUNA_APP_ID or ADZUNA_API_KEY in secrets!');
    return [];
  }

  const url =
    `https://api.adzuna.com/v1/api/jobs/in/search/1` +
    `?app_id=${appId}&app_key=${apiKey}` +
    `&results_per_page=20` +
    `&what=${encodeURIComponent(keyword)}` +
    `&where=Chennai` +
    `&category=it-jobs`;

  console.log(`[ADZUNA] Fetching keyword: "${keyword}"`);

  try {
    const res  = await fetch(url);

    // ── Check for block / bad response ──────────────────
    if (!res.ok) {
      console.error(`[ADZUNA] ⚠️  HTTP ${res.status} — bad response from API`);
      return [];
    }

    const data = await res.json();
    console.log(`[ADZUNA] Raw results count: ${data?.results?.length ?? 0}`);

    return (data.results || []).map(j => ({
      title:      j.title      || '',
      company:    j.company?.display_name  || '',
      location:   j.location?.display_name || '',
      experience: '',               // Adzuna doesn't return experience level
      link:       j.redirect_url   || '',
      source:     'Adzuna',         // ← so you know which source in the email
    }));

  } catch (err) {
    console.error('[ADZUNA] Error:', err.message);
    return [];
  }
}

// ─── FILTER ───────────────────────────────────────────────
function filterJobs(jobs) {
  return jobs.filter(job => {
    if (!job.title) return false;

    const title = job.title.toLowerCase();
    const loc   = (job.location || '').toLowerCase();
    const exp   = (job.experience || '').toLowerCase();

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
      loc.includes('remote')  ||
      loc.includes('work from home') ||
      loc === ''
    );

    const expMatch = (
      exp.includes('0') ||
      exp.includes('fresher') ||
      exp.includes('entry') ||
      exp === ''
    );

    return titleMatch && locationMatch && expMatch;
  });
}

// ─── EMAIL ────────────────────────────────────────────────
function buildEmailHTML(jobs) {
  if (jobs.length === 0) {
    return `
      <h2>🔔 Job Alert Bot</h2>
      <p style="color:red;">
        ⚠️ No matching jobs found today.<br/>
        Possible reasons: Naukri was blocked by IP, Adzuna returned no results,
        or filters were too strict. Check the GitHub Actions log for details.
      </p>`;
  }

  const rows = jobs.map((j, i) => `
    <tr style="background:${i % 2 === 0 ? '#f9f9f9' : '#fff'}">
      <td style="padding:8px;border:1px solid #ddd;">
        <a href="${j.link}" style="color:#1a73e8;">${j.title}</a>
      </td>
      <td style="padding:8px;border:1px solid #ddd;">${j.company}</td>
      <td style="padding:8px;border:1px solid #ddd;">${j.location}</td>
      <td style="padding:8px;border:1px solid #ddd;">${j.experience || '—'}</td>
      <td style="padding:8px;border:1px solid #ddd;font-size:11px;color:#888;">${j.source}</td>
    </tr>
  `).join('');

  return `
    <h2 style="color:#333;">🔔 Job Alert — ${new Date().toLocaleDateString('en-IN')}</h2>
    <p>Found <strong>${jobs.length}</strong> matching jobs today:</p>
    <table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:14px;">
      <thead>
        <tr style="background:#1a73e8;color:#fff;">
          <th style="padding:10px;text-align:left;">Role</th>
          <th style="padding:10px;text-align:left;">Company</th>
          <th style="padding:10px;text-align:left;">Location</th>
          <th style="padding:10px;text-align:left;">Experience</th>
          <th style="padding:10px;text-align:left;">Source</th>
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

  console.log(`[EMAIL] ✅ Sent with ${jobs.length} jobs.`);
}

// ─── MAIN ─────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(50));
  console.log('[BOT] Started at', new Date().toISOString());
  console.log('='.repeat(50));

  const browser = await createBrowser();
  let allJobs   = [];

  try {
    for (const keyword of CONFIG.keywords) {

      // Source 1 — Naukri via Puppeteer
      const naukri = await scrapeNaukri(browser, keyword, CONFIG.location);
      log(`NAUKRI_${keyword}`, naukri);

      // Source 2 — Adzuna via API (reliable fallback)
      const adzuna = await scrapeAdzuna(keyword);
      log(`ADZUNA_${keyword}`, adzuna);

      allJobs.push(...naukri, ...adzuna);
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

    // Send
    await sendEmail(filtered);

  } catch (err) {
    console.error('[BOT] Fatal error:', err);
    process.exit(1);

  } finally {
    await browser.close();
    console.log('[BOT] Done. Browser closed.');
  }
}

main();

// server fix