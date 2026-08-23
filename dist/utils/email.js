"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCompanyInfo = getCompanyInfo;
exports.getCompanyName = getCompanyName;
exports.sendDirectEmail = sendDirectEmail;
exports.sendTemplatedEmail = sendTemplatedEmail;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const nodemailer_1 = __importDefault(require("nodemailer"));
const EmailTemplate_1 = require("../models/EmailTemplate");
const User_1 = require("../models/User");
const Setting_1 = __importDefault(require("../models/Setting"));
const emailLayout_1 = require("./emailLayout");
const notifications_1 = require("./notifications");
/**
 * Creates a Nodemailer transporter using Hostinger SMTP credentials from .env
 */
function createTransporter() {
    return nodemailer_1.default.createTransport({
        host: process.env.EMAIL_HOST || "smtp.hostinger.com",
        port: Number(process.env.EMAIL_PORT) || 465,
        secure: true, // Port 465 always uses SSL
        auth: {
            user: process.env.EMAIL_FROM_ADDRESS,
            pass: process.env.EMAIL_PASSWORD,
        },
    });
}
/**
 * Finds the local path to the company logo asset on the filesystem if available.
 */
function getLocalLogoPath() {
    const candidates = [
        path_1.default.resolve(__dirname, "../assets/CapricornLogo.png"),
        path_1.default.resolve(__dirname, "../../src/assets/CapricornLogo.png"),
        path_1.default.resolve(__dirname, "../../assets/CapricornLogo.png"),
        path_1.default.resolve(process.cwd(), "dist/assets/CapricornLogo.png"),
        path_1.default.resolve(process.cwd(), "src/assets/CapricornLogo.png"),
        path_1.default.resolve(process.cwd(), "assets/CapricornLogo.png"),
        path_1.default.resolve(process.cwd(), "../web/public/CapricornLogo.png"),
    ];
    for (const candidate of candidates) {
        try {
            if (fs_1.default.existsSync(candidate)) {
                return candidate;
            }
        }
        catch (_) { }
    }
    return null;
}
/**
 * Fetches company settings (name, domain, email, logo) from the admin Settings document.
 * Formats the domain to construct the absolute URL to the dashboard logo (/CapricornLogo.png).
 */
async function getCompanyInfo() {
    let companyName = process.env.EMAIL_FROM_NAME || "Capricorn Energy";
    let rawDomain = "capricornenergyholdings.com";
    let companyEmail = process.env.EMAIL_FROM_ADDRESS || "";
    try {
        const setting = await Setting_1.default.findOne({});
        if (setting?.companyName?.trim()) {
            companyName = setting.companyName.trim();
        }
        if (setting?.domainName?.trim()) {
            rawDomain = setting.domainName.trim();
        }
        if (setting?.email?.trim()) {
            companyEmail = setting.email.trim();
        }
    }
    catch (_) { }
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
async function getCompanyName() {
    const info = await getCompanyInfo();
    return info.companyName;
}
/**
 * Returns true if email sending should be suppressed.
 * Suppressed when:
 *   - EMAIL_PASSWORD is not set (no credentials), OR
 *   - SUPPRESS_EMAIL=true is explicitly set in .env
 */
function isEmailSuppressed(label) {
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
async function sendDirectEmail(params) {
    const { to, subject, greeting, content } = params;
    if (isEmailSuppressed(`direct → ${to}`))
        return;
    const companyInfo = await getCompanyInfo();
    const fromName = process.env.EMAIL_FROM_NAME || companyInfo.companyName;
    const fromAddress = process.env.EMAIL_FROM_ADDRESS || companyInfo.companyEmail || "";
    // Replace {{companyName}} and {{domainName}} in subject, greeting, and content
    const vars = { companyName: companyInfo.companyName, domainName: companyInfo.domainName };
    const compiledSubject = (0, notifications_1.compileTemplate)(subject, vars);
    const compiledGreeting = (0, notifications_1.compileTemplate)(greeting, vars);
    const compiledContent = (0, notifications_1.compileTemplate)(content, vars);
    // Check if local logo file is available for inline CID attachment
    const localLogo = getLocalLogoPath();
    const emailLogoUrl = localLogo ? "cid:companylogo" : companyInfo.logoUrl;
    const attachments = localLogo
        ? [{ filename: "CapricornLogo.png", path: localLogo, cid: "companylogo" }]
        : [];
    const html = (0, emailLayout_1.buildEmailHtml)({
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
    }
    catch (err) {
        console.error(`[Email] ✗ Failed to send direct email to "${to}":`, err.message);
        throw new Error(err.message);
    }
}
async function sendTemplatedEmail(params) {
    const { username, templateName, variables, fallbackSubject, fallbackGreeting, fallbackContent } = params;
    if (isEmailSuppressed(`${templateName} → ${username}`))
        return;
    try {
        const user = await User_1.User.findOne({ username: { $regex: new RegExp("^" + username.trim() + "$", "i") } });
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
        let subject = (0, notifications_1.compileTemplate)(fallbackSubject, allVars);
        let greeting = (0, notifications_1.compileTemplate)(fallbackGreeting, allVars);
        let content = (0, notifications_1.compileTemplate)(fallbackContent, allVars);
        let bannerUrl;
        const template = await EmailTemplate_1.EmailTemplate.findOne({ name: templateName });
        if (template) {
            subject = (0, notifications_1.compileTemplate)(template.title, allVars);
            greeting = (0, notifications_1.compileTemplate)(template.greeting, allVars);
            content = (0, notifications_1.compileTemplate)(template.content, allVars);
            bannerUrl = template.banner || undefined;
        }
        // Check if local logo file is available for inline CID attachment
        const localLogo = getLocalLogoPath();
        const emailLogoUrl = localLogo ? "cid:companylogo" : companyInfo.logoUrl;
        const attachments = localLogo
            ? [{ filename: "CapricornLogo.png", path: localLogo, cid: "companylogo" }]
            : [];
        const html = (0, emailLayout_1.buildEmailHtml)({
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
    }
    catch (err) {
        console.error(`[Email] ✗ Failed to send "${templateName}" for user "${username}":`, err);
    }
}
