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
    }
}, {
    timestamps: true
});

export const SettingsModel = mongoose.model('Settings', settingsSchema);
