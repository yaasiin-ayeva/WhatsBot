import axios from 'axios';
import nodemailer from 'nodemailer';
import { IntegrationModel, IntegrationEvent } from '../crm/models/integration.model';
import { SettingsModel } from '../crm/models/settings.model';
import logger from '../configs/logger.config';

/**
 * Dispatches an event to all enabled integrations that subscribe to it.
 * Supports: outbound webhooks, Slack webhooks, Discord webhooks.
 */
export async function fireEvent(event: IntegrationEvent, payload: Record<string, any>): Promise<void> {
    try {
        const integrations = await IntegrationModel.find({ enabled: true, events: event }).lean();
        if (!integrations.length) return;

        const body = {
            event,
            timestamp: new Date().toISOString(),
            ...payload
        };

        await Promise.allSettled(integrations.map(async (integration) => {
            try {
                if (integration.type === 'webhook') {
                    await axios.post(integration.url, body, {
                        timeout: 8000,
                        headers: { 'Content-Type': 'application/json' }
                    });
                } else if (integration.type === 'slack') {
                    const text = formatSlackMessage(event, payload);
                    await axios.post(integration.url, { text }, { timeout: 8000 });
                } else if (integration.type === 'discord') {
                    const content = formatDiscordMessage(event, payload);
                    await axios.post(integration.url, { content }, { timeout: 8000 });
                } else if (integration.type === 'email') {
                    await sendEmailNotification(integration.url, event, payload);
                }

                // Update last status to OK
                await IntegrationModel.updateOne(
                    { _id: integration._id },
                    { lastStatus: 'ok', lastStatusAt: new Date(), lastError: undefined }
                );
            } catch (err: any) {
                logger.warn(`Integration "${integration.name}" failed for event "${event}":`, err.message);
                await IntegrationModel.updateOne(
                    { _id: integration._id },
                    { lastStatus: 'error', lastStatusAt: new Date(), lastError: err.message }
                );
            }
        }));
    } catch (err) {
        logger.error('fireEvent failed:', err);
    }
}

function formatSlackMessage(event: string, payload: Record<string, any>): string {
    switch (event) {
        case 'message.received':
            return `📨 *New message* from \`${payload.phoneNumber}\`: ${payload.body}`;
        case 'campaign.completed':
            return `✅ *Campaign "${payload.name}"* completed — ${payload.sentCount} sent, ${payload.failedCount} failed`;
        case 'campaign.failed':
            return `❌ *Campaign "${payload.name}"* failed`;
        case 'contact.new':
            return `👤 *New contact* \`${payload.phoneNumber}\` (${payload.name || 'unknown'})`;
        case 'scheduled.sent':
            return `📅 *Scheduled message* sent to \`${payload.phoneNumber}\``;
        case 'scheduled.failed':
            return `⚠️ *Scheduled message* to \`${payload.phoneNumber}\` failed: ${payload.error}`;
        case 'autoreply.triggered':
            return `🤖 *Auto-reply* triggered for \`${payload.phoneNumber}\` (rule: ${payload.rule})`;
        default:
            return `🔔 Event: *${event}*\n\`\`\`${JSON.stringify(payload, null, 2)}\`\`\``;
    }
}

async function sendEmailNotification(recipients: string, event: string, payload: Record<string, any>): Promise<void> {
    const settings = await SettingsModel.findOne().lean() as any;
    const smtp = settings?.smtp;
    if (!smtp?.host || !smtp?.user || !smtp?.pass) {
        throw new Error('SMTP not configured in Settings');
    }

    const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port || 587,
        secure: smtp.secure || false,
        auth: { user: smtp.user, pass: smtp.pass }
    });

    const subject = formatEmailSubject(event, payload);
    const html = formatEmailBody(event, payload);
    const from = smtp.fromEmail
        ? `"${smtp.fromName || 'WhatsBot'}" <${smtp.fromEmail}>`
        : smtp.user;

    await transporter.sendMail({
        from,
        to: recipients,
        subject,
        html
    });
}

function formatEmailSubject(event: string, payload: Record<string, any>): string {
    switch (event) {
        case 'message.received':   return `[WhatsBot] New message from ${payload.phoneNumber}`;
        case 'campaign.completed': return `[WhatsBot] Campaign "${payload.name}" completed`;
        case 'campaign.failed':    return `[WhatsBot] Campaign "${payload.name}" failed`;
        case 'contact.new':        return `[WhatsBot] New contact: ${payload.phoneNumber}`;
        case 'scheduled.sent':     return `[WhatsBot] Scheduled message sent to ${payload.phoneNumber}`;
        case 'scheduled.failed':   return `[WhatsBot] Scheduled message failed: ${payload.phoneNumber}`;
        case 'autoreply.triggered':return `[WhatsBot] Auto-reply triggered for ${payload.phoneNumber}`;
        default:                   return `[WhatsBot] Event: ${event}`;
    }
}

function formatEmailBody(event: string, payload: Record<string, any>): string {
    const rows = Object.entries(payload)
        .map(([k, v]) => `<tr><td style="padding:6px 12px;font-weight:600;color:#374151;white-space:nowrap">${k}</td><td style="padding:6px 12px;color:#6b7280">${v}</td></tr>`)
        .join('');
    return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
      <div style="background:#075e54;padding:20px 24px;display:flex;align-items:center;gap:12px">
        <span style="font-size:22px">🤖</span>
        <span style="color:#fff;font-size:1.1rem;font-weight:700">WhatsBot Notification</span>
      </div>
      <div style="padding:24px">
        <p style="margin:0 0 16px;font-size:0.95rem;color:#374151">Event <strong style="color:#4f46e5">${event}</strong> was triggered:</p>
        <table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px;overflow:hidden">
          <tbody>${rows}</tbody>
        </table>
        <p style="margin:20px 0 0;font-size:0.78rem;color:#9ca3af">Sent by WhatsBot CRM · ${new Date().toLocaleString()}</p>
      </div>
    </div>`;
}

function formatDiscordMessage(event: string, payload: Record<string, any>): string {
    switch (event) {
        case 'message.received':
            return `📨 **New message** from \`${payload.phoneNumber}\`: ${payload.body}`;
        case 'campaign.completed':
            return `✅ **Campaign "${payload.name}"** completed — ${payload.sentCount} sent, ${payload.failedCount} failed`;
        case 'campaign.failed':
            return `❌ **Campaign "${payload.name}"** failed`;
        case 'contact.new':
            return `👤 **New contact** \`${payload.phoneNumber}\` (${payload.name || 'unknown'})`;
        case 'scheduled.sent':
            return `📅 **Scheduled message** sent to \`${payload.phoneNumber}\``;
        case 'scheduled.failed':
            return `⚠️ **Scheduled message** to \`${payload.phoneNumber}\` failed: ${payload.error}`;
        case 'autoreply.triggered':
            return `🤖 **Auto-reply** triggered for \`${payload.phoneNumber}\` (rule: ${payload.rule})`;
        default:
            return `🔔 Event: **${event}**\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
    }
}
