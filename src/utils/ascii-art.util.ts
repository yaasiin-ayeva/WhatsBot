const fs = require('fs');

export const readAsciiArt = () => {
    try {
        const asciiArt = fs.readFileSync('public/.ascii.art', 'utf-8');
        return asciiArt;
    } catch (error) {
        console.error("Error reading ASCII art:", error);
        return null;
    }
};