import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import { EmailTemplate } from "../models/EmailTemplate";
import { User } from "../models/User";
import Setting from "../models/Setting";
import { buildEmailHtml } from "./emailLayout";
import { compileTemplate } from "./notifications";

/**
 * Creates a Nodemailer transporter using Hostinger SMTP credentials from .env
 */
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.hostinger.com",
    port: Number(process.env.EMAIL_PORT) || 465,
    secure: true, // Port 465 always uses SSL
    auth: {
      user: process.env.EMAIL_FROM_ADDRESS,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
}

export interface CompanyInfo {
  companyName: string;
  domainName: string;
  companyEmail: string;
  logoUrl: string;
}

/**
 * Finds the local path to the company logo asset on the filesystem if available.
 */
function getLocalLogoPath(): string | null {
  const candidates = [
    path.resolve(__dirname, "../assets/CapricornLogo.png"),
    path.resolve(__dirname, "../../src/assets/CapricornLogo.png"),
    path.resolve(__dirname, "../../assets/CapricornLogo.png"),
    path.resolve(process.cwd(), "dist/assets/CapricornLogo.png"),
    path.resolve(process.cwd(), "src/assets/CapricornLogo.png"),
    path.resolve(process.cwd(), "assets/CapricornLogo.png"),
    path.resolve(process.cwd(), "../web/public/CapricornLogo.png"),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch (_) {}
  }
  return null;
}

/**
 * Fetches company settings (name, domain, email, logo) from the admin Settings document.
 * Formats the domain to construct the absolute URL to the dashboard logo (/CapricornLogo.png).
 */
export async function getCompanyInfo(): Promise<CompanyInfo> {
  let companyName = process.env.EMAIL_FROM_NAME || "Capricorn Energy";
  let rawDomain = "capricornenergyholdings.com";
  let companyEmail = process.env.EMAIL_FROM_ADDRESS || "";

  try {
    const setting = await Setting.findOne({});
    if (setting?.companyName?.trim()) {
      companyName = setting.companyName.trim();
    }
    if (setting?.domainName?.trim()) {
      rawDomain = setting.domainName.trim();
    }
    if (setting?.email?.trim()) {
      companyEmail = setting.email.trim();
    }
  } catch (_) {}

  // Format domain to proper URL with protocol, removing trailing slashes
  const cleanDomain = rawDomain.replace(/\/+$/, "");
  const domainUrl = cleanDomain.startsWith("http://") || cleanDomain.startsWith("https://")
    ? cleanDomain
    : `https://${cleanDomain}`;

  // Dashboard logo is served from /CapricornLogo.png
  const logoUrl = `${domainUrl}/CapricornLogo.png`;

  return {
    companyName,
    domainName: domainUrl,
    companyEmail,
    logoUrl,
  };
}

/**
 * Fetches the company name from the admin Settings document.
 * Falls back to EMAIL_FROM_NAME env var or "Capricorn Energy".
 */
export async function getCompanyName(): Promise<string> {
  const info = await getCompanyInfo();
  return info.companyName;
}

/**
 * Returns true if email sending should be suppressed.
 * Suppressed when:
 *   - EMAIL_PASSWORD is not set (no credentials), OR
 *   - SUPPRESS_EMAIL=true is explicitly set in .env
 */
function isEmailSuppressed(label: string): boolean {
  if (!process.env.EMAIL_PASSWORD) {
    console.warn(`[Email] EMAIL_PASSWORD not set — skipping "${label}"`);
    return true;
  }
  if (process.env.SUPPRESS_EMAIL === "true") {
    console.log(`[Email:SUPPRESSED] "${label}" (SUPPRESS_EMAIL=true)`);
    return true;
  }
  return false;
}

/**
 * Sends an email directly to any address without requiring a registered user lookup.
 * Used for contact form inquiries and other outbound emails to arbitrary recipients.
 */
export async function sendDirectEmail(params: {
  to: string;
  subject: string;
  greeting: string;
  content: string;
}) {
  const { to, subject, greeting, content } = params;

  if (isEmailSuppressed(`direct → ${to}`)) return;

  const companyInfo = await getCompanyInfo();
  const fromName = process.env.EMAIL_FROM_NAME || companyInfo.companyName;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS || companyInfo.companyEmail || "";

  // Replace {{companyName}} and {{domainName}} in subject, greeting, and content
  const vars = { companyName: companyInfo.companyName, domainName: companyInfo.domainName };
  const compiledSubject = compileTemplate(subject, vars);
  const compiledGreeting = compileTemplate(greeting, vars);
  const compiledContent = compileTemplate(content, vars);

  // Check if local logo file is available for inline CID attachment
  const localLogo = getLocalLogoPath();
  const emailLogoUrl = localLogo ? "cid:companylogo" : companyInfo.logoUrl;
  const attachments = localLogo
    ? [{ filename: "CapricornLogo.png", path: localLogo, cid: "companylogo" }]
    : [];

  const html = buildEmailHtml({
    title: compiledSubject,
    greeting: compiledGreeting,
    content: compiledContent,
    companyName: companyInfo.companyName,
    companyEmail: companyInfo.companyEmail,
    domainUrl: companyInfo.domainName,
    logoUrl: emailLogoUrl,
  });

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to,
      subject: compiledSubject,
      html,
      attachments,
    });
    console.log(`[Email] ✓ Direct email sent to ${to} — subject: "${compiledSubject}"`);
  } catch (err: any) {
    console.error(`[Email] ✗ Failed to send direct email to "${to}":`, err.message);
    throw new Error(err.message);
  }
}

export async function sendTemplatedEmail(params: {
  username: string;
  templateName: string;
  variables: Record<string, any>;
  fallbackSubject: string;
  fallbackGreeting: string;
  fallbackContent: string;
}) {
  const { username, templateName, variables, fallbackSubject, fallbackGreeting, fallbackContent } = params;

  if (isEmailSuppressed(`${templateName} → ${username}`)) return;

  try {
    const user = await User.findOne({ username: { $regex: new RegExp("^" + username.trim() + "$", "i") } });
    if (!user?.email) {
      console.warn(`[Email] No email found for username "${username}" — skipping ${templateName}`);
      return;
    }

    const companyInfo = await getCompanyInfo();
    const allVars = {
      username,
      companyName: companyInfo.companyName,
      domainName: companyInfo.domainName,
      ...variables,
    };

    let subject = compileTemplate(fallbackSubject, allVars);
    let greeting = compileTemplate(fallbackGreeting, allVars);
    let content = compileTemplate(fallbackContent, allVars);
    let bannerUrl: string | undefined;

    const template = await EmailTemplate.findOne({ name: templateName });
    if (template) {
      subject = compileTemplate(template.title, allVars);
      greeting = compileTemplate(template.greeting, allVars);
      content = compileTemplate(template.content, allVars);
      bannerUrl = template.banner || undefined;
    }

    // Check if local logo file is available for inline CID attachment
    const localLogo = getLocalLogoPath();
    const emailLogoUrl = localLogo ? "cid:companylogo" : companyInfo.logoUrl;
    const attachments = localLogo
      ? [{ filename: "CapricornLogo.png", path: localLogo, cid: "companylogo" }]
      : [];

    const html = buildEmailHtml({
      title: subject,
      greeting,
      content,
      bannerUrl,
      companyName: companyInfo.companyName,
      companyEmail: companyInfo.companyEmail,
      domainUrl: companyInfo.domainName,
      logoUrl: emailLogoUrl,
    });
    const fromName = process.env.EMAIL_FROM_NAME || companyInfo.companyName;
    const fromAddress = process.env.EMAIL_FROM_ADDRESS || companyInfo.companyEmail || "";

    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to: user.email,
      subject,
      html,
      attachments,
    });

    console.log(`[Email] ✓ "${templateName}" sent to ${user.email}`);
  } catch (err) {
    console.error(`[Email] ✗ Failed to send "${templateName}" for user "${username}":`, err);
  }
}
