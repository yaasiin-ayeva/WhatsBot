import mongoose, { Document, Schema } from 'mongoose';
import crypto from 'crypto';

export interface IWidgetSettings extends Document {
    widgetId: string;
    enabled: boolean;
    buttonStyle: 'round' | 'tab';
    displayPosition: 'bottom-right' | 'bottom-left';
    primaryColor: string;
    secondaryColor: string;
    headerText: string;
    operatorName: string;
    welcomeMessage: string;
    onlineMessage: string;
    offlineMessage: string;
    placeholderText: string;
    logoUrl: string;
    trackVisitorIp: boolean;
    allowedDomains: string[];
    whatsappMode: boolean;
    whatsappNumber: string;
}

const WidgetSettingsSchema = new Schema<IWidgetSettings>({
    widgetId: { type: String, default: () => crypto.randomBytes(12).toString('hex') },
    enabled: { type: Boolean, default: true },
    buttonStyle: { type: String, enum: ['round', 'tab'], default: 'round' },
    displayPosition: { type: String, enum: ['bottom-right', 'bottom-left'], default: 'bottom-right' },
    primaryColor: { type: String, default: '#128C7E' },
    secondaryColor: { type: String, default: '#25D366' },
    headerText: { type: String, default: 'Chat with us' },
    operatorName: { type: String, default: 'Support' },
    welcomeMessage: { type: String, default: 'Hi there! How can we help you today?' },
    onlineMessage: { type: String, default: 'We typically reply in a few minutes' },
    offlineMessage: { type: String, default: "We're offline now. We'll reply as soon as possible." },
    placeholderText: { type: String, default: 'Type a message…' },
    logoUrl: { type: String, default: '' },
    trackVisitorIp: { type: Boolean, default: false },
    allowedDomains: [{ type: String }],
    whatsappMode: { type: Boolean, default: false },
    whatsappNumber: { type: String, default: '' },
}, { timestamps: true });

export const WidgetSettingsModel = mongoose.model<IWidgetSettings>('WidgetSettings', WidgetSettingsSchema);
