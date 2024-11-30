import { Message } from "whatsapp-web.js";
import { onboard } from "../utils/onboarding.util";

export const run = async (message: Message, _args: string[] = null) => {
    await onboard(message, false);
};
