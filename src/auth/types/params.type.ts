import { UserRoles } from '../../user/entities/user.entity';

export interface AuthParams {
  _id: string;
  role: UserRoles;
}
