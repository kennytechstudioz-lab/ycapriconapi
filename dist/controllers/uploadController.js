"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadMedia = uploadMedia;
exports.deleteMedia = deleteMedia;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const Setting_1 = __importDefault(require("../models/Setting"));
/**
 * Controller: Handles a single image/media file upload directly to the server filesystem.
 *
 * @param req Express Request object containing the multer-parsed file
 * @param res Express Response object
 */
async function uploadMedia(req, res) {
    try {
        // 1. Ensure a file exists in the multipart request body
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: "No image file provided in the upload request payload.",
            });
        }
        const { buffer, originalname } = req.file;
        // 2. Save file to local uploads directory on the server
        const uploadsDir = path_1.default.join(process.cwd(), "uploads");
        if (!fs_1.default.existsSync(uploadsDir)) {
            fs_1.default.mkdirSync(uploadsDir, { recursive: true });
        }
        const cleanFileName = originalname.replace(/\s+/g, "_");
        const filename = `${Date.now()}-${cleanFileName}`;
        const filePath = path_1.default.join(uploadsDir, filename);
        fs_1.default.writeFileSync(filePath, buffer);
        let hostUrl = "";
        if (req.headers.host) {
            const protocol = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
            hostUrl = `${protocol}://${req.headers.host}`;
        }
        else {
            const setting = await Setting_1.default.findOne({});
            const rawDomain = setting?.domainName || "capricornenergyholdings.com";
            hostUrl = rawDomain.startsWith("http") ? rawDomain.replace(/\/+$/, "") : `https://${rawDomain.replace(/\/+$/, "")}`;
        }
        const localUrl = `${hostUrl}/uploads/${filename}`;
        return res.status(200).json({
            success: true,
            url: localUrl,
            fileName: originalname,
        });
    }
    catch (err) {
        console.error("Upload Error: ", err);
        return res.status(500).json({
            success: false,
            error: err.message || "An unexpected error occurred while uploading file to the server.",
        });
    }
}
/**
 * Controller: Removes an image from server storage given its public URL link.
 *
 * @param req Express Request containing target URL in body
 * @param res Express Response
 */
async function deleteMedia(req, res) {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({
                success: false,
                error: "No image public URL provided in request payload.",
            });
        }
        // Handle local uploads directory deletion
        if (url.includes("/uploads/")) {
            const filename = url.split("/uploads/")[1];
            const filePath = path_1.default.join(process.cwd(), "uploads", filename);
            if (fs_1.default.existsSync(filePath)) {
                fs_1.default.unlinkSync(filePath);
            }
        }
        return res.status(200).json({
            success: true,
            message: "Media file deleted successfully from the server.",
        });
    }
    catch (err) {
        console.error("Deletion Error: ", err);
        return res.status(500).json({
            success: false,
            error: err.message || "An unexpected error occurred while deleting media object from the server.",
        });
    }
}
