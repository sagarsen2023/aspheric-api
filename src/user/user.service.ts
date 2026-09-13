import { Injectable } from '@nestjs/common';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
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

  async findOne({
    id,
    includePassword,
  }: {
    id: string;
    includePassword?: boolean;
  }) {
    const user = await this.userModel
      .findOne({ _id: id })
      .select(`${includePassword ? '+password' : ''}`);
    return user;
  }

  async findOneByEmail({
    email,
    includePassword = false,
  }: {
    email: string;
    includePassword?: boolean;
  }) {
    const query = this.userModel.findOne({ email });
    if (includePassword) {
      query.select('+password');
    }

    return await query;
  }

  async update({
    id,
    updateUserDto,
  }: {
    id: string;
    updateUserDto: UpdateUserDto;
  }) {
    return await this.userModel.findByIdAndUpdate(id, updateUserDto, {
      returnDocument: 'after',
    });
  }

  async managePublicationAndVerification({
    id,
    isPublished,
  }: {
    id: string;
    isPublished?: boolean;
  }) {
    return await this.userModel.findByIdAndUpdate(
      id,
      { isPublished },
      { returnDocument: 'after' },
    );
  }

  async remove(id: string) {
    return await this.userModel.findByIdAndUpdate(
      id,
      { isDeleted: true },
      { returnDocument: 'after' },
    );
  }

  async updatePassword({
    id,
    hashedPassword,
  }: {
    id: string;
    hashedPassword: string;
  }) {
    return await this.userModel.findByIdAndUpdate(
      id,
      { password: hashedPassword },
      { returnDocument: 'after' },
    );
  }
}
