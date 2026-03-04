import mongoose, { Document, Schema } from 'mongoose';

export interface IFlowSession extends Document {
    phoneNumber:     string;
    flowId:          mongoose.Types.ObjectId;
    currentNodeId:   string;
    variables:       Map<string, string>;
    waitingForReply: boolean;
    pendingVariable: string;
    resumeAt?:       Date;
    startedAt:       Date;
    lastActivityAt:  Date;
    status: 'active' | 'completed' | 'timed_out' | 'cancelled';
}

const FlowSessionSchema = new Schema<IFlowSession>({
    phoneNumber:     { type: String, required: true, index: true },
    flowId:          { type: Schema.Types.ObjectId, ref: 'Flow', required: true },
    currentNodeId:   { type: String, required: true },
    variables:       { type: Map, of: String, default: {} },
    waitingForReply: { type: Boolean, default: false },
    pendingVariable: { type: String, default: '' },
    resumeAt:        { type: Date },
    startedAt:       { type: Date, default: Date.now },
    lastActivityAt:  { type: Date, default: Date.now },
    status:          { type: String, enum: ['active', 'completed', 'timed_out', 'cancelled'], default: 'active', index: true },
}, { timestamps: true });

// Compound index for quick active-session lookups
FlowSessionSchema.index({ phoneNumber: 1, status: 1 });

export const FlowSessionModel = mongoose.model<IFlowSession>('FlowSession', FlowSessionSchema);
