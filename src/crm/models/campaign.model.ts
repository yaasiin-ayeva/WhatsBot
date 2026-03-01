import mongoose, { Document, Schema } from 'mongoose';

export interface ICampaign extends Document {
  name: string;
  message: string;
  scheduledAt: Date;
  status: 'draft' | 'scheduled' | 'sent' | 'failed' | 'sending';
  contacts: string[]; // Array of phone numbers
  sentCount: number;
  failedCount: number;
  createdBy: mongoose.Types.ObjectId;
  recurringType: 'none' | 'daily' | 'weekly' | 'monthly';
  recurringDay?: number;
  deliveryReport: Array<{ phone: string; status: 'sent' | 'failed' | 'skipped'; error?: string; sentAt: Date }>;
}

const CampaignSchema = new Schema<ICampaign>({
  name: { type: String, required: true },
  message: { type: String, required: true },
  scheduledAt: { type: Date },
  status: { type: String, enum: ['draft', 'scheduled', 'sent', 'failed', 'sending'], default: 'draft' },
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
    sentAt: Date
  }]
}, { timestamps: true });

export const CampaignModel = mongoose.model<ICampaign>('Campaign', CampaignSchema);