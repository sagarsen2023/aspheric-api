import { CreateUserDto } from '../../user/dto/user.dto';

export interface RegistrationResponse {
  accessToken: string;
  user: Partial<CreateUserDto>;
}
