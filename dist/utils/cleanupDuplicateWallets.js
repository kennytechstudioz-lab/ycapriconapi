"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deduplicateAllUserWallets = deduplicateAllUserWallets;
const Wallet_1 = require("../models/Wallet");
/**
 * Deduplicates any existing redundant wallets in the database and ensures
 * unique index consistency on (username, currencySymbol).
 */
async function deduplicateAllUserWallets() {
    try {
        console.log("[Wallet Startup Cleanup] Checking for duplicate user wallets in MongoDB...");
        // Find all (username, currencySymbol) groups that have more than 1 wallet
        const duplicates = await Wallet_1.Wallet.aggregate([
            {
                $group: {
                    _id: {
                        username: { $toLower: "$username" },
                        currencySymbol: { $toUpper: "$currencySymbol" },
                    },
                    count: { $sum: 1 },
                    walletIds: { $push: "$_id" },
                },
            },
            {
                $match: {
                    count: { $gt: 1 },
                },
            },
        ]);
        if (Array.isArray(duplicates) && duplicates.length > 0) {
            console.log(`[Wallet Startup Cleanup] Found ${duplicates.length} duplicate wallet groups. Consolidating...`);
            for (const group of duplicates) {
                const { username, currencySymbol } = group._id;
                const walletIds = group.walletIds;
                const wallets = await Wallet_1.Wallet.find({ _id: { $in: walletIds } });
                if (wallets.length <= 1)
                    continue;
                // Select the primary wallet (highest balance or populated address)
                const primary = wallets.reduce((best, curr) => {
                    if ((curr.balance || 0) > (best.balance || 0))
                        return curr;
                    if (!best.address && curr.address)
                        return curr;
                    return best;
                }, wallets[0]);
                let mergedBalance = 0;
                let mergedDeposit = 0;
                let mergedWithdrawal = 0;
                let mergedActiveDeposit = 0;
                let bestAddress = primary.address || "";
                const toDelete = [];
                for (const w of wallets) {
                    mergedBalance += Number(w.balance) || 0;
                    mergedDeposit += Number(w.totalDeposit) || 0;
                    mergedWithdrawal += Number(w.totalWithdrawal) || 0;
                    mergedActiveDeposit += Number(w.activeDeposit) || 0;
                    if (!bestAddress && w.address)
                        bestAddress = w.address;
                    if (w._id.toString() !== primary._id.toString()) {
                        toDelete.push(w._id);
                    }
                }
                if (toDelete.length > 0) {
                    await Wallet_1.Wallet.deleteMany({ _id: { $in: toDelete } });
                }
                primary.balance = mergedBalance;
                primary.totalDeposit = mergedDeposit;
                primary.totalWithdrawal = mergedWithdrawal;
                primary.activeDeposit = mergedActiveDeposit;
                primary.address = bestAddress;
                primary.currencySymbol = (primary.currencySymbol || currencySymbol || "").trim().toUpperCase();
                await primary.save();
                console.log(`[Wallet Startup Cleanup] Consolidated ${wallets.length} ${currencySymbol} wallets for "${username}" into balance $${mergedBalance}.`);
            }
        }
        else {
            console.log("[Wallet Startup Cleanup] No duplicate wallets found in database.");
        }
        // Enforce MongoDB unique compound index
        await Wallet_1.Wallet.syncIndexes().catch((idxErr) => {
            console.warn("[Wallet Startup Cleanup] Index sync notice:", idxErr?.message || idxErr);
        });
        console.log("[Wallet Startup Cleanup] Compound unique index on { username: 1, currencySymbol: 1 } verified.");
    }
    catch (error) {
        console.error("✗ Error in deduplicateAllUserWallets startup task:", error);
    }
}
