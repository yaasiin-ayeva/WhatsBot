import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
    maxFileSizeMb: {
        type: Number,
        default: 150
    },
    autoDownloadEnabled: {
        type: Boolean,
        default: true
    },
    defaultAudioAiCommand: {
        type: String,
        enum: ['chat', 'gpt', 'claude'],
        default: 'chat'
    },
    disabledCommands: {
        type: [String],
        default: []
    },
    commandStats: {
        type: Map,
        of: Number,
        default: {}
    },
    apiKeys: {
        type: Map,
        of: String,
        default: {}
    },
    inboundApiKey: {
        type: String,
        default: ''
    },
    smtp: {
        host:     { type: String, default: '' },
        port:     { type: Number, default: 587 },
        secure:   { type: Boolean, default: false },
        user:     { type: String, default: '' },
        pass:     { type: String, default: '' },
        fromName: { type: String, default: 'WhatsBot' },
        fromEmail:{ type: String, default: '' }
    }
}, {
    timestamps: true
});

export const SettingsModel = mongoose.model('Settings', settingsSchema);
