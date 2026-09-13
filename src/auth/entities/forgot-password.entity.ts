import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({
  versionKey: false,
  expires: '600s', // Expire in 10 minutes,
})
export class ForgotPassword {
  @Prop({ required: true, index: true })
  email!: string;

  @Prop()
  otp?: number;

  @Prop({ required: false, type: Date })
  expiryTime?: Date;
}

export const ForgotPasswordSchema =
  SchemaFactory.createForClass(ForgotPassword);
ForgotPasswordSchema.index({ expiryTime: 1 }, { expireAfterSeconds: 0 });
