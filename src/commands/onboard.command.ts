import { Message } from "whatsapp-web.js";
import { onboard } from "../utils/onboarding.util";
import { UserI18n } from "../utils/i18n.util";

export const run = async (message: Message, _args: string[] = null, userI18n: UserI18n) => {
    await onboard(message, userI18n, false);
};
