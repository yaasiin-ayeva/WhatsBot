import mongoose from 'mongoose';
import EnvConfig from './env.config';
import logger from './logger.config';

export async function connectDB() {
  try {
    if (!EnvConfig.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    await mongoose.connect(EnvConfig.MONGODB_URI);
    logger.info('Connected to MongoDB');
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    process.exit(1);
  }
}