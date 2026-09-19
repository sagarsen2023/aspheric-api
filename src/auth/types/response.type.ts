import { PublicUser } from '../../user/dto/user.dto';

export interface RegistrationResponse {
  accessToken: string;
  user: PublicUser;
}
