import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('salud')
@Controller('health')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Verificar el estado del servicio' })
  @ApiResponse({ status: 200, description: 'Servicio en funcionamiento' })
  getHealth() {
    return this.appService.getHealth();
  }
}
