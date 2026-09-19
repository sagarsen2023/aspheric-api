import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({
  versionKey: false,
})
export class ForgotPassword {
  @Prop({ required: true, unique: true })
  email!: string;

  @Prop({ required: true })
  otpHash!: string;

  @Prop({ required: false, type: Date })
  expiryTime?: Date;
}

export const ForgotPasswordSchema =
  SchemaFactory.createForClass(ForgotPassword);
ForgotPasswordSchema.index({ expiryTime: 1 }, { expireAfterSeconds: 0 });
