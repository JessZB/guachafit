import type { Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Database } from '@guachafit/database';
import type { PreferenciasNotificacionService } from '../preferencias-notificacion.service';
import type { DispositivosService } from '../dispositivos.service';
import type { AdaptadorCorreo } from '../correo/adaptador-correo';

/**
 * Contexto de dependencias explícito del despachador (P2): la fachada lo
 * construye en su constructor y cada caso lo recibe como parámetro.
 * Sin wiring nuevo de Nest: los casos son funciones planas.
 */
export interface ContextoDespachador {
  db: Database;
  logger: Logger;
  preferenciasService: PreferenciasNotificacionService;
  dispositivosService: DispositivosService;
  pushQueue: Queue;
  emailQueue: Queue;
  adaptadorCorreo?: AdaptadorCorreo;
}
