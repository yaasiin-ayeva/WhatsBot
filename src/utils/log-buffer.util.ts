import { EventEmitter } from 'events';
import { Writable } from 'stream';

export interface LogEntry {
    level: string;
    message: string;
    timestamp: string;
}

class LogBufferSingleton {
    private static _instance: LogBufferSingleton;
    public readonly entries: LogEntry[] = [];
    public readonly emitter = new EventEmitter();
    private readonly maxSize = 500;

    static getInstance(): LogBufferSingleton {
        if (!this._instance) this._instance = new LogBufferSingleton();
        return this._instance;
    }

    push(entry: LogEntry): void {
        if (this.entries.length >= this.maxSize) this.entries.shift();
        this.entries.push(entry);
        this.emitter.emit('log', entry);
    }
}

export const LogBuffer = LogBufferSingleton;

/**
 * Creates a Writable stream that receives JSON log lines from Winston's
 * Stream transport and feeds them into the LogBuffer.
 */
export function createLogBufferStream(): Writable {
    return new Writable({
        write(chunk: Buffer, _encoding: string, callback: () => void) {
            try {
                const line = chunk.toString().trim();
                if (line) {
                    const parsed = JSON.parse(line);
                    LogBufferSingleton.getInstance().push({
                        level: String(parsed.level || 'info'),
                        message: String(parsed.message || ''),
                        timestamp: String(parsed.timestamp || new Date().toISOString()),
                    });
                }
            } catch {
                // Ignore malformed lines
            }
            callback();
        }
    });
}
