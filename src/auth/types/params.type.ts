import { UserDocument } from '../../user/entities/user.entity';
import { UserRoles } from '../../user/types/user.type';
import { Request } from 'express';

export interface AuthParams {
  _id: string;
  role: UserRoles;
}

export interface AuthenticatedRequest extends Request {
  user: UserDocument;
}

export interface OptionalAuthenticatedRequest extends Request {
  user?: UserDocument;
}
