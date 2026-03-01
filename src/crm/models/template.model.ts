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
    }
}, {
    timestamps: true
});

export const TemplateModel = mongoose.model('Template', templateSchema);