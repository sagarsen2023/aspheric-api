import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({
  versionKey: false,
})
export class Registration {
  @Prop({ unique: true })
  email!: string;

  @Prop()
  registrationToken?: string;

  @Prop({ required: true })
  otpHash!: string;

  @Prop()
  otpExpiryTime!: Date;

  @Prop({ default: Date.now, expires: 172800 }) // 2 days
  createdAt!: Date;
}

export const RegistrationSchema = SchemaFactory.createForClass(Registration);
