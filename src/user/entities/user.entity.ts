import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { UserRoles } from '../types/user.type';

export type UserDocument = HydratedDocument<User>;

@Schema({
  versionKey: false,
})
export class User {
  @Prop({
    required: true,
  })
  name!: string;

  @Prop({
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  })
  email!: string;

  @Prop({
    type: String,
    required: true,
    enum: UserRoles,
    default: UserRoles.USER,
  })
  role!: UserRoles;

  @Prop({
    required: true,
    select: false,
  })
  password!: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
