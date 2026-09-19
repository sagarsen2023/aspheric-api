import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';

export type AuthDocument = HydratedDocument<Auth>;

@Schema({
  versionKey: false,
})
export class Auth {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
  })
  userId!: mongoose.Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    unique: true,
  })
  accessTokenHash!: string;

  @Prop({ type: Date, required: true, expires: 0 })
  expiresAt!: Date;
}

export const AuthSchema = SchemaFactory.createForClass(Auth);
