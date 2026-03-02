import { EventEmitter } from 'events';

class MessageEmitter extends EventEmitter {
    private static _instance: MessageEmitter;

    private constructor() {
        super();
        this.setMaxListeners(100);
    }

    static getInstance(): MessageEmitter {
        if (!MessageEmitter._instance) {
            MessageEmitter._instance = new MessageEmitter();
        }
        return MessageEmitter._instance;
    }
}

export const messageEmitter = MessageEmitter.getInstance();
