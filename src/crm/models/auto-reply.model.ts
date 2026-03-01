import mongoose, { Document, Schema } from 'mongoose';

export interface IAutoReply extends Document {
    name: string;
    enabled: boolean;
    matchType: 'exact' | 'contains' | 'startsWith' | 'regex';
    trigger: string;          // keyword or regex pattern
    response: string;         // static response text (used when useAI is false)
    useAI: boolean;
    aiProvider: 'openai' | 'gemini' | 'none';
    aiPrompt: string;         // system prompt for AI provider
    cooldownMinutes: number;  // per-contact cooldown to avoid spam
    priority: number;         // higher = checked first
    createdBy: mongoose.Types.ObjectId;
}

const AutoReplySchema = new Schema<IAutoReply>({
    name:            { type: String, required: true },
    enabled:         { type: Boolean, default: true },
    matchType:       { type: String, enum: ['exact', 'contains', 'startsWith', 'regex'], default: 'contains' },
    trigger:         { type: String, required: true },
    response:        { type: String, default: '' },
    useAI:           { type: Boolean, default: false },
    aiProvider:      { type: String, enum: ['openai', 'gemini', 'none'], default: 'none' },
    aiPrompt:        { type: String, default: 'You are a helpful WhatsApp assistant. Reply briefly and helpfully.' },
    cooldownMinutes: { type: Number, default: 60 },
    priority:        { type: Number, default: 0 },
    createdBy:       { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

AutoReplySchema.index({ priority: -1, enabled: 1 });

export const AutoReplyModel = mongoose.model<IAutoReply>('AutoReply', AutoReplySchema);
