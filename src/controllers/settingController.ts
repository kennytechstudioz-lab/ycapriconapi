import { Request, Response } from "express";
import Setting from "../models/Setting";

/**
 * Controller: Fetches the single global system configuration document.
 * If none exists in MongoDB, automatically creates one with system defaults.
 */
export async function getSettings(req: Request, res: Response) {
  try {
    let setting = await Setting.findOne({});
    if (!setting) {
      // Auto-initialize standard default configurations
      setting = await Setting.create({});
    }
    return res.status(200).json({
      success: true,
      setting,
    });
  } catch (error: any) {
    console.error("✗ Error in getSettings controller:", error);
    return res.status(500).json({
      error: "Internal server error retrieving system configurations.",
    });
  }
}

/**
 * Controller: Updates/upserts the global system configurations.
 */
export async function updateSettings(req: Request, res: Response) {
  try {
    const { companyName, domainName, email, phone, address, description, showCurrency, registrationLink, documents, mapEmbed } = req.body;

    let setting = await Setting.findOne({});
    if (!setting) {
      setting = new Setting();
    }

    // Apply values if defined in the payload parameters
    if (companyName !== undefined) setting.companyName = String(companyName).trim();
    if (domainName !== undefined) setting.domainName = String(domainName).trim();
    if (email !== undefined) setting.email = String(email).trim();
    if (phone !== undefined) setting.phone = String(phone).trim();
    if (address !== undefined) setting.address = String(address).trim();
    if (description !== undefined) setting.description = String(description).trim();
    if (showCurrency !== undefined) setting.showCurrency = Boolean(showCurrency);
    if (registrationLink !== undefined) (setting as any).registrationLink = String(registrationLink).trim();
    if (documents !== undefined) (setting as any).documents = documents;
    if (mapEmbed !== undefined) (setting as any).mapEmbed = String(mapEmbed);

    await setting.save();

    console.log("✓ System settings updated successfully by admin administrator.");

    return res.status(200).json({
      success: true,
      setting,
    });
  } catch (error: any) {
    console.error("✗ Error in updateSettings controller:", error);
    return res.status(500).json({
      error: "Internal server error deploying system settings changes.",
    });
  }
}
