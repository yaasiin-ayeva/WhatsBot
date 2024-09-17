import Redis from 'ioredis';
import Queue, { Job } from 'bull';
import logger from './configs/logger.config';
import commands from './commands/index';
import { AppConfig } from './configs/app.config';
import { isUrl } from './utils/common.util';
import { identifySocialNetwork } from './utils/get.util';
import { cpus } from 'os';
import EnvConfig from './configs/env.config';
import { Message } from 'whatsapp-web.js';
const messagePrototype = require('whatsapp-web.js/src/structures/Message');

const messageQueue = new Queue("message-queue", {
    redis: {
        host: EnvConfig.REDIS_HOST,
        port: EnvConfig.REDIS_PORT,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy: (times: number) => {
            if (times > 10) {
                logger.error(`Redis connection failed after ${times} attempts. Giving up.`);
                return null;
            }
            const delay = Math.min(times * 50, 2000);
            logger.info(`Retrying Redis connection in ${delay}ms...`);
            return delay;
        }
    },
});

const NUM_WORKERS = Math.max(2, Math.min(4, cpus().length - 1)); // 2 - 4 workers

export const addMessageToQueue = async (message: Message) => {
    logger.info(`Adding message to queue...`);

    // save message prototype in redis
    const messageProto = Object.getPrototypeOf(message);
    console.log(messageProto);

    await messageQueue.add({ message: message });
};

const processMessage = async (job: Job, client: any) => {

    logger.info(`Worker ${job.queue.name}-${job.id} processing message...`);

    const message: Message = job.data.message;
    const content = message.body.trim();
    const prefix = AppConfig.instance.getBotPrefix();

    console.log(content, prefix);

    if (AppConfig.instance.getSupportedMessageTypes().indexOf(message.type) === -1) {
        return;
    }

    const args = content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();

    try {
        if (message.from === client.info.wid._serialized) return;
        if (message.isStatus) return;

        if (message.type === 'ptt') {
            await commands[AppConfig.instance.getDefaultAudioAiCommand()].run(message, args);
        } else if (message.type === 'chat') {
            const url = content.trim().split(/ +/)[0];
            const socialNetwork = identifySocialNetwork(url);

            if (url && isUrl(url) && socialNetwork) {
                await commands["get"].run(message, null, url, socialNetwork);
            } else {
                if (!content.startsWith(prefix)) return;

                if (command && command in commands) {
                    await commands[command].run(message, args);
                } else {
                    message.reply(`> 🤖 Unknown command: ${command}, to see available commands, type ${prefix}help`);
                }
            }
        }
    } catch (error) {
        message.reply(`> 🤖 Oops, something went wrong, kindly retry.`);
        logger.error(error);
    }
};

export const initializeQueue = (client: any) => {

    logger.info(`Initializing message queue...`);

    messageQueue.process(NUM_WORKERS, async (job: Job) => {
        await processMessage(job, client);
    });

    messageQueue.on('active', (job) => {
        logger.info(`Job ${job.id} active`);
    });

    messageQueue.on('completed', (job) => {
        logger.info(`Job ${job.id} completed`);
    });

    messageQueue.on('failed', (job, err) => {
        logger.error(`Job ${job.id} failed with error: ${err.message}`);
    });

    messageQueue.on('error', (error) => {
        logger.error(`Queue error: ${error}`);
    });

    logger.info(`Initialized message queue with ${NUM_WORKERS} workers`);
};

export const checkRedisConnection = async () => {
    const redis = new Redis({
        host: EnvConfig.REDIS_HOST,
        port: EnvConfig.REDIS_PORT,
    });

    try {
        await redis.ping();
        logger.info('Successfully connected to Redis');
    } catch (error) {
        logger.error(`Failed to connect to Redis: ${error}`);
        throw error;
    } finally {
        await redis.quit();
    }
};