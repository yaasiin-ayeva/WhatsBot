import winston = require("winston");
import { createLogBufferStream } from '../utils/log-buffer.util';

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
        new winston.transports.Stream({
            stream: createLogBufferStream(),
            format: winston.format.combine(
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                winston.format.json()
            )
        }),
    ],
});

export default logger;