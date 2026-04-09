import fs from "fs";

const FILE = "./data/sentJobs.json";

export function filterNewJobs(jobs) {
  let sent = [];

  if (fs.existsSync(FILE)) {
    sent = JSON.parse(fs.readFileSync(FILE));
  }

  const newJobs = jobs.filter(job =>
    !sent.some(s => s.link === job.link)
  );

  fs.writeFileSync(FILE, JSON.stringify([...sent, ...newJobs], null, 2));

  return newJobs;
}