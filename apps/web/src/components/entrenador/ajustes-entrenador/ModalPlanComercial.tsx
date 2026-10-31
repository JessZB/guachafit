/**
 * RF-018 · Ajustes del entrenador: modal crear/editar plan comercial.
 *
 * Extraído de `pages/entrenador/AjustesPage.tsx`. El formulario se monta al abrir: crear arranca
 * vacío y editar precarga el plan. Valida antes de enviar y muestra el error en `AvisosAjustes`
 * (role="alert"). Con cambios sin guardar, cerrar pide confirmación. El precio es el total de la
 * duración del plan (decisión D7).
 */
import { useState, type FormEvent } from 'react';
import { CreditCard, X } from 'lucide-react';
import type { PlanMembresiaDetalleDTO } from '@guachafit/shared';
import { triggerHaptic } from '../../../lib/haptics';
import { useDialogoAccesible } from '../../../lib/use-dialogo-accesible';
import { pluralizar } from '../../../lib/pluralizar';
import type { DatosFormularioPlan } from '../../../lib/ajustes-entrenador-planes';
import {
  AvisosAjustes,
  BotonAjustes,
  CampoAjustes,
  SelectAjustes,
} from '../../ajustes/CampoAjustes';
import { DialogoConfirmacion } from '../../common/DialogoConfirmacion';

const OPCIONES_DURACION = [1, 2, 3, 6, 12].map((meses) => ({
  valor: String(meses),
  etiqueta: pluralizar(meses, 'mes', 'meses'),
}));

/** Hasta 7 dígitos enteros y 2 decimales como máximo. */
const PATRON_PRECIO = /^\d{1,7}([.,]\d{1,2})?$/;

/** Acepta coma o punto decimal. Devuelve el importe con punto, o `null` si no es mayor que 0. */
function normalizarPrecio(texto: string): string | null {
  const limpio = texto.trim();
  if (!PATRON_PRECIO.test(limpio)) return null;
  const normalizado = limpio.replace(',', '.');
  return Number(normalizado) > 0 ? normalizado : null;
}

/** Primer error del formulario, o `null` si puede enviarse. */
function errorFormulario(nombre: string, precio: string, beneficios: string[]): string | null {
  if (!nombre.trim()) return 'Escribe el nombre del plan.';
  if (normalizarPrecio(precio) === null) {
    return 'Indica un precio mayor que 0, con hasta dos decimales (por ejemplo, 30,00).';
  }
  if (beneficios.length === 0) return 'Agrega al menos un beneficio al plan.';
  return null;
}

export interface ModalPlanComercialProps {
  /** `null` = crear; con plan = editar (precarga sus valores). */
  plan: PlanMembresiaDetalleDTO | null;
  isSubmitting: boolean;
  successMsg: string | null;
  /** Error del último guardado fallido. Se muestra en este modal. */
  errorGuardado?: string | null;
  onGuardar: (
    datos: DatosFormularioPlan,
    editingPlanId: string | null,
    onCierreExito: () => void
  ) => void;
  onCerrar: () => void;
}

export function ModalPlanComercial({
  plan,
  isSubmitting,
  successMsg,
  errorGuardado = null,
  onGuardar,
  onCerrar,
}: ModalPlanComercialProps) {
  const editingPlanId = plan?.id ?? null;
  const valoresIniciales = {
    nombre: plan?.nombre ?? '',
    descripcion: plan?.descripcion ?? '',
    // Misma forma que el usuario escribe (coma decimal): pasa la validación del campo.
    precio: plan ? plan.precioBaseUsd.replace('.', ',') : '',
    duracion: plan?.duracionMeses ?? 1,
    beneficios: plan && Array.isArray(plan.beneficios) ? [...plan.beneficios] : [],
  };

  const [nombrePlan, setNombrePlan] = useState(valoresIniciales.nombre);
  const [descripcionPlan, setDescripcionPlan] = useState(valoresIniciales.descripcion);
  const [precioBaseUsd, setPrecioBaseUsd] = useState(valoresIniciales.precio);
  const [duracionMeses, setDuracionMeses] = useState(valoresIniciales.duracion);
  const [beneficios, setBeneficios] = useState<string[]>([...valoresIniciales.beneficios]);
  const [nuevoBeneficio, setNuevoBeneficio] = useState('');
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);
  const [confirmandoCierre, setConfirmandoCierre] = useState(false);

  const hayCambios =
    nombrePlan !== valoresIniciales.nombre ||
    descripcionPlan !== valoresIniciales.descripcion ||
    precioBaseUsd !== valoresIniciales.precio ||
    duracionMeses !== valoresIniciales.duracion ||
    JSON.stringify(beneficios) !== JSON.stringify(valoresIniciales.beneficios) ||
    nuevoBeneficio.trim() !== '';

  // Tras un guardado con éxito no hay nada que perder: cualquier cierre es directo.
  const bloqueado = isSubmitting || Boolean(successMsg);

  function intentarCerrar() {
    if (hayCambios && !successMsg) setConfirmandoCierre(true);
    else onCerrar();
  }

  // U3b: semántica de diálogo, Escape, trampa de Tab y restore del foco.
  const refModalPlan = useDialogoAccesible({
    abierto: true,
    onCerrar: intentarCerrar,
  });

  function agregarBeneficio() {
    const texto = nuevoBeneficio.trim();
    if (!texto || bloqueado) return;
    triggerHaptic('selection');
    // Sin duplicados: el texto es la clave estable de cada beneficio.
    if (!beneficios.includes(texto)) setBeneficios([...beneficios, texto]);
    setNuevoBeneficio('');
  }

  function quitarBeneficio(texto: string) {
    triggerHaptic('selection');
    setBeneficios(beneficios.filter((b) => b !== texto));
  }

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    // Con guardado en curso o éxito pendiente, el envío no hace nada.
    if (bloqueado) return;
    const mensaje = errorFormulario(nombrePlan, precioBaseUsd, beneficios);
    setErrorValidacion(mensaje);
    const precio = normalizarPrecio(precioBaseUsd);
    if (mensaje || precio === null) return;
    onGuardar(
      { nombre: nombrePlan, descripcion: descripcionPlan, precioBaseUsd: precio, duracionMeses, beneficios },
      editingPlanId,
      onCerrar
    );
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) intentarCerrar();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        ref={refModalPlan}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ajustes-plan-titulo"
        tabIndex={-1}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-card border border-border p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" aria-hidden="true" />
            <h3 id="ajustes-plan-titulo" className="font-bold text-base text-foreground">
              {editingPlanId ? 'Editar plan' : 'Nuevo plan'}
            </h3>
          </div>
          <button
            type="button"
            onClick={intentarCerrar}
            aria-label="Cerrar plan"
            className="min-h-11 min-w-11 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <AvisosAjustes exito={successMsg} />

        <form noValidate onSubmit={enviar} className="space-y-4">
          <CampoAjustes
            id="plan-nombre"
            etiqueta="Nombre del plan"
            valor={nombrePlan}
            onCambiar={setNombrePlan}
            autoComplete="off"
            placeholder="Ej. Plan personalizado 4 días"
            deshabilitado={bloqueado}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CampoAjustes
              id="plan-precio"
              etiqueta="Precio base"
              valor={precioBaseUsd}
              onCambiar={setPrecioBaseUsd}
              inputMode="decimal"
              autoComplete="off"
              sufijo="USD"
              descripcion="Precio total por la duración del plan."
              placeholder="0,00"
              deshabilitado={bloqueado}
            />
            <SelectAjustes
              id="plan-duracion"
              etiqueta="Duración"
              valor={String(duracionMeses)}
              onCambiar={(valor) => setDuracionMeses(parseInt(valor, 10))}
              opciones={OPCIONES_DURACION}
              deshabilitado={bloqueado}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="plan-descripcion" className="text-xs font-semibold text-muted-foreground">
              Descripción del plan
            </label>
            <textarea
              id="plan-descripcion"
              rows={2}
              value={descripcionPlan}
              onChange={(e) => setDescripcionPlan(e.target.value)}
              disabled={bloqueado}
              placeholder="Describe brevemente el alcance del plan..."
              className="w-full px-3 py-2 rounded-xl bg-background border border-border text-base sm:text-sm text-foreground focus:outline-hidden focus:border-primary resize-none disabled:opacity-60"
            />
          </div>

          <div role="group" aria-labelledby="plan-beneficios-titulo" className="space-y-2">
            <span id="plan-beneficios-titulo" className="block text-xs font-semibold text-muted-foreground">
              Beneficios del plan
            </span>
            <div className="flex gap-2">
              <label htmlFor="plan-nuevo-beneficio" className="sr-only">
                Nuevo beneficio
              </label>
              <input
                id="plan-nuevo-beneficio"
                type="text"
                value={nuevoBeneficio}
                onChange={(e) => setNuevoBeneficio(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    agregarBeneficio();
                  }
                }}
                disabled={bloqueado}
                placeholder="Ej. Check-in semanal de peso"
                className="flex-1 min-w-0 min-h-11 px-3 rounded-xl bg-background border border-border text-base sm:text-sm text-foreground focus:outline-hidden focus:border-primary"
              />
              <BotonAjustes type="button" variante="secundario" onClick={agregarBeneficio}>
                Añadir
              </BotonAjustes>
            </div>

            {beneficios.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aún no has añadido beneficios.</p>
            ) : (
              <ul className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {beneficios.map((beneficio) => (
                  <li
                    key={beneficio}
                    className="flex items-center justify-between gap-2 p-2 rounded-xl bg-secondary/30 border border-border/60 text-xs"
                  >
                    <span className="min-w-0 break-words text-foreground">{beneficio}</span>
                    <button
                      type="button"
                      onClick={() => quitarBeneficio(beneficio)}
                      aria-label={`Quitar beneficio ${beneficio}`}
                      disabled={bloqueado}
                      className="min-h-11 min-w-11 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive cursor-pointer disabled:opacity-50"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <AvisosAjustes error={errorValidacion ?? errorGuardado} />

          <div className="pt-3 flex justify-end gap-2 border-t border-border/80">
            <BotonAjustes type="button" variante="secundario" onClick={intentarCerrar}>
              Cancelar
            </BotonAjustes>
            <BotonAjustes type="submit" ocupado={bloqueado}>
              {isSubmitting ? 'Guardando…' : editingPlanId ? 'Guardar cambios' : 'Crear plan'}
            </BotonAjustes>
          </div>
        </form>
      </div>

      <DialogoConfirmacion
        abierto={confirmandoCierre}
        idTitulo="plan-confirmar-cierre"
        titulo="¿Salir sin guardar?"
        detalle="Tienes cambios sin guardar en este plan. Si sales ahora, se perderán."
        textoConfirmar="Salir sin guardar"
        textoCancelar="Seguir editando"
        variante="peligro"
        onCancelar={() => setConfirmandoCierre(false)}
        onConfirmar={onCerrar}
      />
    </div>
  );
}
