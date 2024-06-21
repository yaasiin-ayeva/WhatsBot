import logger from "../configs/logger.config";
const fs = require('fs');

export const isUrl = (url) => {
    return url.match(new RegExp(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/, 'gi'))
}

export const del_file = (filePath: string) => {
    try {

        fs.unlinkSync(filePath);
        logger.info(`${filePath} deleted`);

    } catch (err) {
        logger.warn(err);
    }
}

export const format_localtime = (localtime: string): string => {
    const date = new Date(localtime);
    return date.toLocaleString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}