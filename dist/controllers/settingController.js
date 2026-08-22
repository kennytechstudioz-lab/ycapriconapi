"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSettings = getSettings;
exports.updateSettings = updateSettings;
const Setting_1 = __importDefault(require("../models/Setting"));
/**
 * Controller: Fetches the single global system configuration document.
 * If none exists in MongoDB, automatically creates one with system defaults.
 */
async function getSettings(req, res) {
    try {
        let setting = await Setting_1.default.findOne({});
        if (!setting) {
            // Auto-initialize standard default configurations
            setting = await Setting_1.default.create({});
        }
        return res.status(200).json({
            success: true,
            setting,
        });
    }
    catch (error) {
        console.error("✗ Error in getSettings controller:", error);
        return res.status(500).json({
            error: "Internal server error retrieving system configurations.",
        });
    }
}
/**
 * Controller: Updates/upserts the global system configurations.
 */
async function updateSettings(req, res) {
    try {
        const { companyName, domainName, email, phone, address, description, showCurrency, registrationLink, documents, mapEmbed } = req.body;
        let setting = await Setting_1.default.findOne({});
        if (!setting) {
            setting = new Setting_1.default();
        }
        // Apply values if defined in the payload parameters
        if (companyName !== undefined)
            setting.companyName = String(companyName).trim();
        if (domainName !== undefined)
            setting.domainName = String(domainName).trim();
        if (email !== undefined)
            setting.email = String(email).trim();
        if (phone !== undefined)
            setting.phone = String(phone).trim();
        if (address !== undefined)
            setting.address = String(address).trim();
        if (description !== undefined)
            setting.description = String(description).trim();
        if (showCurrency !== undefined)
            setting.showCurrency = Boolean(showCurrency);
        if (registrationLink !== undefined)
            setting.registrationLink = String(registrationLink).trim();
        if (documents !== undefined)
            setting.documents = documents;
        if (mapEmbed !== undefined)
            setting.mapEmbed = String(mapEmbed);
        await setting.save();
        console.log("✓ System settings updated successfully by admin administrator.");
        return res.status(200).json({
            success: true,
            setting,
        });
    }
    catch (error) {
        console.error("✗ Error in updateSettings controller:", error);
        return res.status(500).json({
            error: "Internal server error deploying system settings changes.",
        });
    }
}
