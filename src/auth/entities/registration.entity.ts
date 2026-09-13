import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({
  versionKey: false,
  expires: 172800, // 2 days
})
export class Registration {
  @Prop({ unique: true })
  email!: string;

  @Prop()
  registrationToken?: string;

  @Prop()
  otp!: number;

  @Prop()
  otpExpiryTime!: Date;

  @Prop({ default: Date.now, expires: 172800 }) // 2 days
  createdAt!: Date;
}

export const RegistrationSchema = SchemaFactory.createForClass(Registration);
