import mongoose, { Document, Schema } from 'mongoose';

export type ScoreAction = 'first_interaction' | 'message_received' | 'command_used' | 'campaign_reply';

export interface IScoreRule extends Document {
    action: ScoreAction;
    label: string;
    points: number;
    enabled: boolean;
}

const ScoreRuleSchema = new Schema<IScoreRule>({
    action: {
        type: String,
        enum: ['first_interaction', 'message_received', 'command_used', 'campaign_reply'],
        required: true,
        unique: true
    },
    label: { type: String, required: true },
    points: { type: Number, required: true, default: 1 },
    enabled: { type: Boolean, default: true }
}, { timestamps: true });

export const ScoreRuleModel = mongoose.model<IScoreRule>('ScoreRule', ScoreRuleSchema);
