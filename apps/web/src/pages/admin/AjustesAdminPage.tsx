/**
 * RF-018 RN-09: "Ajustes" del administrador (`/admin/ajustes`). El superadmin no tiene ficha de
 * perfil: solo gestiona su correo de acceso y su contraseña.
 */
import { PantallaAjustes } from '../../components/ajustes/PantallaAjustes';

export function AjustesAdminPage() {
  return <PantallaAjustes descripcion="Tu correo de acceso y tu contraseña." />;
}
