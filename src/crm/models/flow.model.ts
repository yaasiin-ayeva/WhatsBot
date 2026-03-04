import mongoose, { Document, Schema } from 'mongoose';

export type FlowNodeType =
    | 'trigger' | 'message' | 'question' | 'condition'
    | 'tag' | 'delay' | 'set_variable' | 'score'
    | 'jump' | 'transfer' | 'end';

export interface IFlowNode {
    id: string;
    type: FlowNodeType;
    position: { x: number; y: number };
    data: Record<string, any>;
}

export interface IFlowEdge {
    id: string;
    source: string;
    sourceHandle: string; // 'out' | 'yes' | 'no'
    target: string;
}

export interface IFlow extends Document {
    name: string;
    description: string;
    status: 'draft' | 'published';
    trigger: {
        type: 'keyword' | 'any_message' | 'first_contact' | 'tag_applied' | 'campaign_reply';
        keywords: string[];
        tagName: string;
    };
    nodes: IFlowNode[];
    edges: IFlowEdge[];
    stats: {
        activations: number;
        completions: number;
    };
}

const FlowNodeSchema = new Schema<IFlowNode>({
    id:       { type: String, required: true },
    type:     { type: String, required: true },
    position: { x: { type: Number, default: 0 }, y: { type: Number, default: 0 } },
    data:     { type: Schema.Types.Mixed, default: {} },
}, { _id: false });

const FlowEdgeSchema = new Schema<IFlowEdge>({
    id:           { type: String, required: true },
    source:       { type: String, required: true },
    sourceHandle: { type: String, default: 'out' },
    target:       { type: String, required: true },
}, { _id: false });

const FlowSchema = new Schema<IFlow>({
    name:        { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    status:      { type: String, enum: ['draft', 'published'], default: 'draft' },
    trigger: {
        type:     { type: String, enum: ['keyword', 'any_message', 'first_contact', 'tag_applied', 'campaign_reply'], default: 'keyword' },
        keywords: [{ type: String }],
        tagName:  { type: String, default: '' },
    },
    nodes: [FlowNodeSchema],
    edges: [FlowEdgeSchema],
    stats: {
        activations: { type: Number, default: 0 },
        completions:  { type: Number, default: 0 },
    },
}, { timestamps: true });

export const FlowModel = mongoose.model<IFlow>('Flow', FlowSchema);
