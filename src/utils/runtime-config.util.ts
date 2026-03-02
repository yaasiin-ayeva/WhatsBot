import { SettingsModel } from "../crm/models/settings.model";
import { decryptValue } from "./crypto.util";
import logger from "../configs/logger.config";

export async function hydrateRuntimeConfigFromSettings(): Promise<void> {
    try {
        const settings = await SettingsModel.findOne().lean() as any;
        const apiKeys = settings?.apiKeys;
        if (!apiKeys) return;

        const entries = apiKeys instanceof Map
            ? Array.from(apiKeys.entries())
            : Object.entries(apiKeys);

        for (const [key, value] of entries) {
            if (value && !process.env[key]) {
                process.env[key] = decryptValue(String(value));
            }
        }
    } catch (error) {
        logger.error('Failed to hydrate runtime config from settings:', error);
    }
}
