import mongoose, { Document, Schema } from 'mongoose';

export interface ICampaign extends Document {
  name: string;
  message: string;
  scheduledAt: Date;
  status: 'draft' | 'scheduled' | 'sent' | 'failed' | 'sending' | 'paused' | 'cancelled' | 'archived';
  contacts: string[];
  sentCount: number;
  failedCount: number;
  createdBy: mongoose.Types.ObjectId;
  recurringType: 'none' | 'daily' | 'weekly' | 'monthly';
  recurringDay?: number;
  deliveryReport: Array<{
    phone: string;
    status: 'sent' | 'failed' | 'skipped';
    error?: string;
    sentAt: Date;
    repliedAt?: Date;
  }>;
  notes: string;
  throttleRate: number;
  expiresAt?: Date;
  excludeTags: string[];
  abVariantB: string;
  messages: Array<{ content: string; delaySeconds: number }>;
  mediaUrl?: string;
}

const CampaignSchema = new Schema<ICampaign>({
  name: { type: String, required: true },
  message: { type: String, required: true },
  scheduledAt: { type: Date },
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'sent', 'failed', 'sending', 'paused', 'cancelled', 'archived'],
    default: 'draft'
  },
  contacts: [{ type: String }],
  sentCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  recurringType: { type: String, enum: ['none', 'daily', 'weekly', 'monthly'], default: 'none' },
  recurringDay: { type: Number },
  deliveryReport: [{
    phone: String,
    status: { type: String, enum: ['sent', 'failed', 'skipped'] },
    error: String,
    sentAt: Date,
    repliedAt: Date
  }],
  notes: { type: String, default: '' },
  throttleRate: { type: Number, default: 60 },
  expiresAt: { type: Date },
  excludeTags: [{ type: String }],
  abVariantB: { type: String, default: '' },
  messages: [{
    content: { type: String },
    delaySeconds: { type: Number, default: 0 }
  }],
  mediaUrl: { type: String, default: '' }
}, { timestamps: true });

export const CampaignModel = mongoose.model<ICampaign>('Campaign', CampaignSchema);
