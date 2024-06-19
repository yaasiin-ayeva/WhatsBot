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