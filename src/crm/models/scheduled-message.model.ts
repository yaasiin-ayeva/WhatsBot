import mongoose, { Document, Schema } from 'mongoose';

export interface IScheduledMessage extends Document {
    phoneNumber: string;
    contactName?: string;
    message: string;
    scheduledAt: Date;
    status: 'pending' | 'sent' | 'failed' | 'cancelled';
    error?: string;
    sentAt?: Date;
    createdBy: mongoose.Types.ObjectId;
}

const ScheduledMessageSchema = new Schema<IScheduledMessage>({
    phoneNumber:  { type: String, required: true },
    contactName:  { type: String },
    message:      { type: String, required: true },
    scheduledAt:  { type: Date, required: true },
    status:       { type: String, enum: ['pending', 'sent', 'failed', 'cancelled'], default: 'pending' },
    error:        { type: String },
    sentAt:       { type: Date },
    createdBy:    { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

ScheduledMessageSchema.index({ scheduledAt: 1, status: 1 });

export const ScheduledMessageModel = mongoose.model<IScheduledMessage>('ScheduledMessage', ScheduledMessageSchema);
