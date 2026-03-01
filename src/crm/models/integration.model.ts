import mongoose, { Document, Schema } from 'mongoose';

export interface IIntegration extends Document {
    name: string;
    type: 'webhook' | 'slack' | 'discord' | 'email';
    enabled: boolean;
    url: string;             // webhook/slack/discord URL; for email: comma-separated recipient addresses
    events: string[];        // e.g. ['message.received', 'campaign.completed']
    secret?: string;         // for webhook signature verification
    lastStatus?: 'ok' | 'error';
    lastStatusAt?: Date;
    lastError?: string;
    createdBy: mongoose.Types.ObjectId;
}

const IntegrationSchema = new Schema<IIntegration>({
    name:        { type: String, required: true },
    type:        { type: String, enum: ['webhook', 'slack', 'discord', 'email'], required: true },
    enabled:     { type: Boolean, default: true },
    url:         { type: String, required: true },
    events:      [{ type: String }],
    secret:      { type: String, default: '' },
    lastStatus:  { type: String, enum: ['ok', 'error'] },
    lastStatusAt:{ type: Date },
    lastError:   { type: String },
    createdBy:   { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

export const IntegrationModel = mongoose.model<IIntegration>('Integration', IntegrationSchema);

// Available events that integrations can subscribe to
export const INTEGRATION_EVENTS = [
    'message.received',
    'campaign.completed',
    'campaign.failed',
    'contact.new',
    'scheduled.sent',
    'scheduled.failed',
    'autoreply.triggered'
] as const;

export type IntegrationEvent = typeof INTEGRATION_EVENTS[number];
