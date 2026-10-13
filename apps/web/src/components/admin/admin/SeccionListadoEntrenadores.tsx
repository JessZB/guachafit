/**
 * RF-010 RN-01 (WU Admin): sección del listado y gestión de entrenadores.
 *
 * Componente presentacional puro (sin `useQuery` ni `api-client`): marco de la sección, la tabla
 * (estados honestos dentro) y la paginación cuando hay registros. Recorte verbatim de `AdminPage`.
 */
import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { EstadoLicencia, type EntrenadorAdminDTO } from '@guachafit/shared';
import { TablaEntrenadoresAdmin } from '../TablaEntrenadoresAdmin';
import { Paginacion } from '../../common/Paginacion';

export interface SeccionListadoEntrenadoresProps {
  items: EntrenadorAdminDTO[];
  cargando: boolean;
  error: string | null;
  usuarioActualId?: string;
  procesandoUsuarioId: string | null;
  pagina: number;
  tamano: number;
  total: number;
  onReintentar: () => void;
  onCambiarEstado: (entrenador: EntrenadorAdminDTO, activo: boolean) => void;
  onCambiarLicencia: (entrenador: EntrenadorAdminDTO, estadoLicencia: EstadoLicencia) => void;
  onCambiarPagina: (pagina: number) => void;
  onCambiarTamano: (tamano: number) => void;
}

export function SeccionListadoEntrenadores({
  items,
  cargando,
  error,
  usuarioActualId,
  procesandoUsuarioId,
  pagina,
  tamano,
  total,
  onReintentar,
  onCambiarEstado,
  onCambiarLicencia,
  onCambiarPagina,
  onCambiarTamano,
}: SeccionListadoEntrenadoresProps) {
  return (
    <section className="p-5 sm:p-6 rounded-2xl bg-card border border-border/80 space-y-4">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-xl bg-primary/15 text-primary">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-foreground">Entrenadores de la plataforma</h2>
          <p className="text-xs text-muted-foreground">
            Deshabilita cuentas o suspende licencias: el acceso del entrenador se revoca la
            próxima vez que la persona use la app.
          </p>
        </div>
      </div>

      <TablaEntrenadoresAdmin
        items={items}
        cargando={cargando}
        error={error}
        usuarioActualId={usuarioActualId}
        procesandoUsuarioId={procesandoUsuarioId}
        onReintentar={onReintentar}
        onCambiarEstado={onCambiarEstado}
        onCambiarLicencia={onCambiarLicencia}
      />

      {total > 0 && (
        <Paginacion
          pagina={pagina}
          tamano={tamano}
          total={total}
          onCambiarPagina={onCambiarPagina}
          onCambiarTamano={(nuevoTamano) => {
            onCambiarTamano(nuevoTamano);
            onCambiarPagina(1);
          }}
          cargando={cargando}
        />
      )}
    </section>
  );
}
