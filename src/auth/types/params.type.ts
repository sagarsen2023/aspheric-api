import { UserRoles } from '../../user/types/user.type';

export interface AuthParams {
  _id: string;
  role: UserRoles;
}
