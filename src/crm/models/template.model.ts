import mongoose from 'mongoose';

const templateSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    content: {
        type: String,
        required: true,
        trim: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    category: {
        type: String,
        default: 'general',
        trim: true
    },
    pinned: { type: Boolean, default: false },
    usageCount: { type: Number, default: 0 },
    revision: { type: Number, default: 0 },
    approvalStatus: {
        type: String,
        enum: ['draft', 'pending', 'approved'],
        default: 'draft'
    }
}, {
    timestamps: true
});

export const TemplateModel = mongoose.model('Template', templateSchema);
