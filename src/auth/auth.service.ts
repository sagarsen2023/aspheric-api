import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { Model } from 'mongoose';
import { UserService } from '../user/user.service';
import type { UserDocument } from '../user/entities/user.entity';
import { LoginDto, ResetPasswordDto } from './dto/auth.dto';
import { Auth } from './entities/auth.entity';
import { AuthParams } from './types/params.type';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    private readonly config: ConfigService,
    @InjectModel(Auth.name) private readonly sessions: Model<Auth>,
  ) {}

  async hashPassword(password: string): Promise<string> {
    const rounds = this.config.get<number>('bcryptSaltRounds') ?? 10;
    return bcrypt.hash(password, await bcrypt.genSalt(rounds));
  }

  async createSession(user: UserDocument): Promise<string> {
    const payload: AuthParams = {
      _id: user._id.toString(),
      role: user.role,
    };
    const token = await this.jwtService.signAsync(payload);
    const lifetime = this.config.get<number>('jwtExpirationTime') ?? 604800;
    await this.sessions.create({
      userId: user._id,
      accessTokenHash: this.hashToken(token),
      expiresAt: new Date(Date.now() + lifetime * 1000),
    });
    return token;
  }

  async login(credentials: LoginDto) {
    const user = await this.userService.findOneByEmail({
      email: credentials.email.trim().toLowerCase(),
      includePassword: true,
    });
    if (!user || !(await bcrypt.compare(credentials.password, user.password))) {
      throw new BadRequestException('Invalid email or password');
    }
    return {
      accessToken: await this.createSession(user),
      user: this.userService.toPublic(user),
    };
  }

  async getProfile(userId: string) {
    const user = await this.userService.findOne({ id: userId });
    return user ? this.userService.toPublic(user) : null;
  }

  async logout(token: string): Promise<void> {
    await this.sessions.deleteOne({ accessTokenHash: this.hashToken(token) });
  }

  async resetPassword({
    body,
    userId,
  }: {
    body: ResetPasswordDto;
    userId: string;
  }) {
    const user = await this.userService.findOne({
      id: userId,
      includePassword: true,
    });
    if (!user || !(await bcrypt.compare(body.oldPassword, user.password))) {
      throw new BadRequestException('Invalid old password');
    }
    await this.userService.updatePassword({
      id: userId,
      hashedPassword: await this.hashPassword(body.newPassword),
    });
    await this.revokeUserSessions(userId);
    return { message: 'Password reset successfully' };
  }

  async validateToken(token: string): Promise<AuthParams> {
    try {
      const payload = await this.jwtService.verifyAsync<AuthParams>(token);
      const session = await this.sessions.exists({
        accessTokenHash: this.hashToken(token),
      });
      if (!session) throw new UnauthorizedException('Invalid token');
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  async revokeUserSessions(userId: string): Promise<void> {
    await this.sessions.deleteMany({ userId });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
