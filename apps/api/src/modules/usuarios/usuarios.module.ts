import { Module } from '@nestjs/common';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  // RF-018: "Mi perfil" usa AuthService para contraseña y correo (tokens, enlaces y avisos).
  imports: [AuthModule],
  controllers: [UsuariosController],
  providers: [UsuariosService],
})
export class UsuariosModule {}
