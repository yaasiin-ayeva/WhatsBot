import { Message } from "whatsapp-web.js";
import { geminiCompletion } from "../utils/gemini.util";
import logger from "../configs/logger.config";
import { MessageModel } from "../crm/models/message.model";
import { UserI18n } from "../utils/i18n.util";

/**
 * Parse a human-readable period string (e.g. "1h", "6h", "24h", "2d", "7d")
 * and return a Date representing `now - period`.
 * Defaults to 24 h if the argument is absent or unrecognised.
 */
function parsePeriod(arg?: string): { cutoff: Date; label: string } {
    if (!arg) return { cutoff: new Date(Date.now() - 24 * 3600 * 1000), label: 'last 24 hours' };

    const match = arg.toLowerCase().match(/^(\d+)(h|d|w)$/);
    if (!match) return { cutoff: new Date(Date.now() - 24 * 3600 * 1000), label: 'last 24 hours' };

    const n = parseInt(match[1], 10);
    const unit = match[2];
    let ms: number;
    let label: string;

    if (unit === 'h') {
        ms = n * 3600 * 1000;
        label = `last ${n} hour${n === 1 ? '' : 's'}`;
    } else if (unit === 'd') {
        ms = n * 24 * 3600 * 1000;
        label = `last ${n} day${n === 1 ? '' : 's'}`;
    } else {
        ms = n * 7 * 24 * 3600 * 1000;
        label = `last ${n} week${n === 1 ? '' : 's'}`;
    }

    return { cutoff: new Date(Date.now() - ms), label };
}

function formatTimestamp(date: Date): string {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export const run = async (message: Message, args: string[], _userI18n: UserI18n) => {
    const chat = await message.getChat();

    if (!chat.isGroup) {
        await message.reply('> 🤖 The /recap command only works in group chats.');
        return;
    }

    const { cutoff, label } = parsePeriod(args[0]);
    const groupId = message.from; // e.g. XXXXXXXXX@g.us

    // Fetch messages from DB for this group in the requested window
    let messages: any[];
    try {
        messages = await MessageModel.find({
            groupId,
            isGroup: true,
            timestamp: { $gte: cutoff },
        })
            .sort({ timestamp: 1 })
            .lean();
    } catch (err) {
        logger.error('recap: DB query failed', err);
        await message.reply('> 🤖 Failed to load messages. Please try again later.');
        return;
    }

    if (!messages.length) {
        await message.reply(`> 🤖 No messages found in this group for the ${label}.`);
        return;
    }

    // Build a plain-text transcript
    const transcript = messages
        .map(m => `[${formatTimestamp(new Date(m.timestamp))}] ${m.senderName || m.phoneNumber}: ${m.body}`)
        .join('\n');

    const prompt = `You are summarising a WhatsApp group chat called "${(chat as any).name || 'this group'}".
Below is a transcript of the conversation from the ${label} (${messages.length} messages).
Each line is formatted as: [HH:MM] Name: message

Provide a concise, structured summary in WhatsApp-friendly formatting (use *bold* for section headers). When attributing a topic, decision, or statement to someone, always mention them by name (e.g. "Alice raised...", "Bob agreed..."). Only use names that appear in the transcript — do not invent names.

*Participants*
List every person who sent at least one message.

*Main topics discussed*
For each topic, note who raised or drove it.

*Key decisions or conclusions*
Attribute decisions to the people who made them.

*Important announcements*
Note who announced what.

*Notable exchanges*
Highlight any significant back-and-forth between specific people.

If any section has nothing to report, skip it. Keep the whole summary under 400 words.

Transcript:
${transcript}`;

    try {
        if (chat) await (chat as any).sendStateTyping();
        const result = await geminiCompletion(prompt);
        const summary = result.response.text()?.trim() || 'Could not generate summary.';

        await message.reply(
            `📋 *Group Recap — ${label}*\n_(${messages.length} messages analysed)_\n\n${summary}`
        );
    } catch (err) {
        logger.error('recap: Gemini call failed', err);
        await message.reply('> 🤖 Failed to generate summary. Please try again later.');
    }
};
