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
  })
  accessToken!: string;
}

export const AuthSchema = SchemaFactory.createForClass(Auth);
