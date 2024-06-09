import winston = require("winston");

const enumerateErrorFormat = winston.format((info) => {
    if (info instanceof Error) {
        Object.assign(info, { message: info.stack });
    }
    return info;
});

const logger = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(
        enumerateErrorFormat(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.colorize(),
        winston.format.splat(),
        winston.format.printf(({ level, message, timestamp }) => `[${timestamp}] ${level}: ${message}`)
    ),
    transports: [
        new winston.transports.Console({
            stderrLevels: ['error'],
        }),
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
    ],
});

export default logger;