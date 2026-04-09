import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

export async function sendJobEmail(jobs) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const jobList = jobs.map(job =>
    `🔹 ${job.title}\n🏢 ${job.company}\n📍 ${job.location}\n🔗 ${job.link}\n`
  ).join("\n");

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,
    subject: "🔥 New Frontend/React Jobs Alert",
    text: jobList,
  });

  console.log("✅ Email sent!");
}