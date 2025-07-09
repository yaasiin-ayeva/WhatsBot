import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { UserModel } from '../models/user.model';
import EnvConfig from '../../configs/env.config';
import logger from '../../configs/logger.config';

export class AuthService {
  static async register(username: string, password: string, role: 'admin' | 'user' = 'user') {
    const existingUser = await UserModel.findOne({ username });
    if (existingUser) {
      throw new Error('Username already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new UserModel({ username, password: hashedPassword, role });
    await user.save();

    return user;
  }

  static async login(username: string, password: string) {
    const user = await UserModel.findOne({ username });
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new Error('Invalid credentials');
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      EnvConfig.JWT_SECRET,
      { expiresIn: '1d' }
    );

    return { token, user };
  }

  static async verifyToken(token: string) {
    try {
      return jwt.verify(token, EnvConfig.JWT_SECRET);
    } catch (error) {
      logger.error('Token verification failed:', error);
      return null;
    }
  }
}