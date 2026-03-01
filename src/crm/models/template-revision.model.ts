import mongoose, { Document, Schema } from 'mongoose';

export interface ITemplateRevision extends Document {
    templateId: mongoose.Types.ObjectId;
    revision: number;
    name: string;
    content: string;
    category: string;
    savedBy: string;
    savedAt: Date;
}

const TemplateRevisionSchema = new Schema<ITemplateRevision>({
    templateId: { type: Schema.Types.ObjectId, ref: 'Template', required: true, index: true },
    revision: { type: Number, required: true },
    name: { type: String, required: true },
    content: { type: String, required: true },
    category: { type: String, default: 'general' },
    savedBy: { type: String, default: 'admin' },
    savedAt: { type: Date, default: Date.now }
});

export const TemplateRevisionModel = mongoose.model<ITemplateRevision>('TemplateRevision', TemplateRevisionSchema);
