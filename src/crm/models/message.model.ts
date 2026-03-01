import mongoose, { Document, Schema } from 'mongoose';

export interface IMessage extends Document {
    phoneNumber: string;
    body: string;
    type: 'text' | 'image' | 'document' | 'other';
    direction: 'in' | 'out';
    sentVia: 'whatsapp' | 'admin';
    read: boolean;
    campaignId?: mongoose.Types.ObjectId;
    timestamp: Date;
}

const MessageSchema = new Schema<IMessage>({
    phoneNumber: { type: String, required: true, index: true },
    body: { type: String, required: true },
    type: { type: String, enum: ['text', 'image', 'document', 'other'], default: 'text' },
    direction: { type: String, enum: ['in', 'out'], required: true },
    sentVia: { type: String, enum: ['whatsapp', 'admin'], default: 'whatsapp' },
    read: { type: Boolean, default: false },
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign' },
    timestamp: { type: Date, default: Date.now }
});

export const MessageModel = mongoose.model<IMessage>('Message', MessageSchema);
