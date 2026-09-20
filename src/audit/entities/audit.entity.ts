import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';
import {
  AuditStatus,
  AuditStrategy,
  CategoryScore,
  CheckResult,
} from '../types/audit.type';
import { User } from '../../user/entities/user.entity';

export type AuditDocument = HydratedDocument<Audit>;

const THIRTY_DAYS = 2_592_000;

@Schema({
  versionKey: false,
  timestamps: true,
})
export class Audit {
  @Prop({ required: true, unique: true })
  auditId!: string;

  @Prop({ required: true })
  url!: string;

  @Prop({ required: true })
  normalizedUrl!: string;

  @Prop({
    type: String,
    required: true,
    enum: AuditStrategy,
    default: AuditStrategy.MOBILE,
  })
  strategy!: AuditStrategy;

  @Prop({
    type: String,
    required: true,
    enum: AuditStatus,
    default: AuditStatus.QUEUED,
  })
  status!: AuditStatus;

  @Prop({ type: Number, default: null })
  score!: number | null;

  @Prop({ default: 'N/A' })
  grade!: string;

  @Prop({ type: Array, default: [] })
  categories!: CategoryScore[];

  @Prop({ type: Array, default: [] })
  checks!: CheckResult[];

  @Prop({ type: String, default: null })
  error!: string | null;

  @Prop({ type: Date, default: null })
  startedAt!: Date | null;

  @Prop({ type: Date, default: null })
  finishedAt!: Date | null;

  @Prop({ type: Number, default: null })
  durationMs!: number | null;

  @Prop({ default: Date.now, expires: THIRTY_DAYS })
  createdAt!: Date;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: User.name,
  })
  createdBy?: mongoose.Types.ObjectId;
}

export const AuditSchema = SchemaFactory.createForClass(Audit).index({
  normalizedUrl: 1,
  strategy: 1,
  createdAt: -1,
});
