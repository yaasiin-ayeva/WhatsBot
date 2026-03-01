import mongoose, { Document, Schema } from 'mongoose';

export interface IContact extends Document {
    phoneNumber: string;
    name?: string;
    pushName?: string;
    language?: string;
    detectedLanguage?: 'en' | 'fr' | 'other';
    detectedCountry?: string;
    detectedRegion?: string;
    lastInteraction: Date;
    interactionsCount: number;
    tags: string[];
    blocked: boolean;
    archived: boolean;
}

const ContactSchema = new Schema<IContact>({
    phoneNumber: { type: String, required: true, unique: true },
    name: String,
    pushName: String,
    language: String,
    detectedLanguage: { type: String, enum: ['en', 'fr', 'other'] },
    detectedCountry: String,
    detectedRegion: String,
    lastInteraction: { type: Date, default: Date.now },
    interactionsCount: { type: Number, default: 1 },
    tags: [{ type: String }],
    blocked: { type: Boolean, default: false },
    archived: { type: Boolean, default: false }
}, { timestamps: true });

export const ContactModel = mongoose.model<IContact>('Contact', ContactSchema);