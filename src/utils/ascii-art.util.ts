import logger from "../configs/logger.config";

const fs = require('fs');

export const readAsciiArt = () => {
    try {
        const asciiArt = fs.readFileSync('public/.ascii.art', 'utf-8');
        return asciiArt;
    } catch (error) {
        logger.error(`Error reading ASCII art: ${error}`);
        return null;
    }
};