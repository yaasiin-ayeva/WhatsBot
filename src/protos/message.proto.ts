import { Message } from 'whatsapp-web.js';
const messagePrototype = require('whatsapp-web.js/src/structures/Message');

export function createMessageProto(data: any, client: any): Message {
    const message = Object.create(messagePrototype);
    Object.assign(message, data);

    if (typeof message._patch !== 'function') {
        message._patch = function (data) {
            Object.assign(this, data);
        };
    }

    message.client = client;
    message._patch(data._data);

    const getChatId = message._getChatId = function () {
        return data.fromMe ? data.to : data.from;
    }

    // TODO : Test
    // message.getChat = async function () {
    //     return this.client.getChatById(this._getChatId());
    // };

    // message.getContact = async function () {
    //     return this.client.getContactById(this.author || this.from);
    // };

    message.reply = async function (content, chatId, options = {}) {
        if (!chatId) {
            chatId = getChatId();
        }

        options = {
            ...options,
            quotedMessageId: this.id._serialized
        };

        return this.client.sendMessage(chatId, content, options);
    };

    return message as Message;
}