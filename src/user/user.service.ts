import { Injectable } from '@nestjs/common';
import { CreateUserDto, PublicUser, UpdateProfileDto } from './dto/user.dto';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { User, type UserDocument } from './entities/user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<UserDocument> {
    const createdUser = new this.userModel(createUserDto);
    return await createdUser.save();
  }

  toPublic(user: UserDocument): PublicUser {
    return {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }

  async findOne({
    id,
    includePassword,
  }: {
    id: string;
    includePassword?: boolean;
  }) {
    const query = this.userModel.findById(id);
    if (includePassword) query.select('+password');
    return query;
  }

  async findOneByEmail({
    email,
    includePassword = false,
  }: {
    email: string;
    includePassword?: boolean;
  }) {
    const query = this.userModel.findOne({ email: email.trim().toLowerCase() });
    if (includePassword) {
      query.select('+password');
    }

    return query;
  }

  async update({
    id,
    updateUserDto,
  }: {
    id: string;
    updateUserDto: UpdateProfileDto;
  }) {
    return this.userModel.findByIdAndUpdate(id, updateUserDto, {
      returnDocument: 'after',
      runValidators: true,
    });
  }

  async updatePassword({
    id,
    hashedPassword,
  }: {
    id: string;
    hashedPassword: string;
  }) {
    return this.userModel.findByIdAndUpdate(
      id,
      { password: hashedPassword },
      { returnDocument: 'after' },
    );
  }
}
