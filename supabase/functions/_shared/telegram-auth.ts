import { createHmac } from "node:crypto";

export interface TelegramUser {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    is_premium?: boolean;
}

/**
 * Validates the Telegram initData hash.
 * @param initData The raw initData string from window.Telegram.WebApp.initData
 * @param botToken The Telegram Bot Token
 * @returns The parsed user object if valid, throws an error if invalid
 */
export function validateTelegramWebAppData(initData: string, botToken: string): TelegramUser {
    if (!initData) {
        throw new Error("Missing initData");
    }

    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get("hash");

    if (!hash) {
        throw new Error("Missing hash in initData");
    }

    // Remove hash to create the data-check-string
    urlParams.delete("hash");

    // Sort alphabetically by keys
    const keys = Array.from(urlParams.keys()).sort();
    const dataCheckString = keys.map((key) => `${key}=${urlParams.get(key)}`).join("\n");

    // HMAC-SHA-256 using the bot token as key to generate the secret key
    const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();

    // HMAC-SHA-256 of the data-check-string using the secret key
    const calculatedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    if (calculatedHash !== hash) {
        throw new Error("Invalid Telegram hash (Authentication failed)");
    }

    // Check if data is expired (optional, but good practice - usually 24 hours)
    const authDate = urlParams.get("auth_date");
    if (authDate) {
        const authTime = parseInt(authDate, 10) * 1000;
        const now = Date.now();
        // 24 hours in milliseconds
        if (now - authTime > 24 * 60 * 60 * 1000) {
            throw new Error("Telegram initData has expired");
        }
    }

    // Parse and return the user string
    const userJson = urlParams.get("user");
    if (!userJson) {
        throw new Error("Missing user data in initData");
    }

    return JSON.parse(userJson) as TelegramUser;
}
