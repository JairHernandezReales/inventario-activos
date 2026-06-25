// Variables globales
let activos = [];
let empresas = [];
let categorias = [];
let usuarios = [];
let currentUser = null;
let empresaAEliminar = null;
let categoriaAEliminar = null;
let usuarioAEliminar = null;

// ============ VERIFICAR SESIÓN ============
async function verificarSesion() {
  try {
    const response = await fetch('/api/me');
    if (response.ok) {
      const data = await response.json();
      currentUser = data.user;
      aplicarPermisos();
      actualizarUIUsuario();
      return true;
    } else {
      window.location.href = '/login';
      return false;
    }
  } catch (error) {
    console.error('Error verificando sesión:', error);
    window.location.href = '/login';
    return false;
  }
}

// ============ APLICAR PERMISOS ============
function aplicarPermisos() {
  if (!currentUser) return;
  
  const esAdmin = currentUser.rol === 'admin';
  const puedeEditar = currentUser.rol === 'admin' || currentUser.rol === 'editor';
  const esViewer = currentUser.rol === 'viewer';
  
  // ========== BOTONES DEL HEADER ==========
  // Nuevo Activo - solo admin y editor
  document.getElementById('btnNuevoActivo').style.display = puedeEditar ? 'inline-flex' : 'none';
  
  // Empresas - solo admin y editor (visible para todos pero con acciones limitadas)
  document.getElementById('btnEmpresas').style.display = 'inline-flex';
  
  // Categorías - solo admin y editor (visible para todos pero con acciones limitadas)
  document.getElementById('btnCategorias').style.display = 'inline-flex';
  
  // Usuarios - solo admin
  document.getElementById('btnUsuarios').style.display = esAdmin ? 'inline-flex' : 'none';
  
  // ========== BOTONES EN MODALES ==========
  // Botón "Nueva Empresa" en modal de empresas
  const btnNuevaEmpresa = document.getElementById('btnNuevaEmpresa');
  if (btnNuevaEmpresa) {
    btnNuevaEmpresa.style.display = puedeEditar ? 'inline-flex' : 'none';
  }
  
  // Botón "Nueva Categoría" en modal de categorías
  const btnNuevaCategoria = document.getElementById('btnNuevaCategoria');
  if (btnNuevaCategoria) {
    btnNuevaCategoria.style.display = puedeEditar ? 'inline-flex' : 'none';
  }
  
  // ========== DESHABILITAR ACCIONES EN TABLA ==========
  // Los botones de editar/eliminar se manejan en renderTabla()
  // Pero también podemos ocultar la columna de acciones si es viewer
  if (esViewer) {
    // Ocultar la cabecera de "Acciones"
    const thead = document.querySelector('thead tr');
    if (thead) {
      const ths = thead.querySelectorAll('th');
      if (ths.length >= 8) {
        ths[ths.length - 1].style.display = 'none';
      }
    }
  }
}

// ============ ACTUALIZAR RENDER TABLA ============
// Reemplaza la función renderTabla() con esta versión actualizada
function renderTabla(activosFiltrados) {
  const tbody = document.getElementById('activosTable');
  const puedeEditar = currentUser && (currentUser.rol === 'admin' || currentUser.rol === 'editor');
  const esAdmin = currentUser && currentUser.rol === 'admin';
  const esViewer = currentUser && currentUser.rol === 'viewer';
  
  // Ocultar/mostrar columna de acciones en el thead
  const thead = document.querySelector('thead tr');
  if (thead) {
    const ths = thead.querySelectorAll('th');
    if (ths.length >= 8) {
      ths[ths.length - 1].style.display = esViewer ? 'none' : '';
    }
  }
  
  if (activosFiltrados.length === 0) {
    const colspan = esViewer ? 7 : 8;
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="loading">No hay activos registrados</td></tr>`;
    return;
  }

  tbody.innerHTML = activosFiltrados.map(activo => {
    let acciones = '';
    
    if (!esViewer) {
      // QR siempre visible para admin y editor
      acciones += `<button class="btn-qr" onclick="generarQR('${activo.codigo}')">📱 QR</button>`;
      
      if (puedeEditar) {
        acciones += ` <button class="btn-edit" onclick="editarActivo(${activo.id})">✏️</button>`;
      }
      
      if (esAdmin) {
        acciones += ` <button class="btn-delete" onclick="eliminarActivo(${activo.id})">🗑️</button>`;
      }
    }
    
    // Si es viewer, solo mostramos el QR
    if (esViewer) {
      acciones = `<button class="btn-qr" onclick="generarQR('${activo.codigo}')">📱 QR</button>`;
    }
    
    const accionesColspan = esViewer ? '' : '';
    
    return `
      <tr>
        <td><strong>${activo.codigo}</strong></td>
        <td>${activo.nombre}</td>
        <td>${activo.categoria_nombre || '-'}</td>
        <td>${activo.empresa_nombre || 'Sin empresa'}</td>
        <td>${activo.responsable_nombre || '-'}</td>
        <td><span class="status-badge status-${activo.estado?.toLowerCase() || 'activo'}">${activo.estado || 'ACTIVO'}</span></td>
        <td>$${activo.valor_actual?.toLocaleString() || '0'}</td>
        <td ${esViewer ? 'style="display:none;"' : ''}>
          <div class="action-buttons">
            ${acciones}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ============ ACTUALIZAR UI USUARIO ============
function actualizarUIUsuario() {
  if (currentUser) {
    document.getElementById('userName').textContent = `👤 ${currentUser.nombre}`;
    const rolBadge = document.getElementById('userRol');
    rolBadge.textContent = currentUser.rol.toUpperCase();
    rolBadge.className = `rol-badge rol-${currentUser.rol}`;
    
    // Añadir clase al body para estilos específicos
    document.body.classList.remove('viewer-mode', 'editor-mode', 'admin-mode');
    document.body.classList.add(`${currentUser.rol}-mode`);
  }
}

// ============ CERRAR SESIÓN CON MODAL ============
function cerrarSesion() {
  document.getElementById('modalConfirmLogout').style.display = 'block';
}

function cerrarConfirmLogout() {
  document.getElementById('modalConfirmLogout').style.display = 'none';
}

async function confirmarLogout() {
  try {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  } catch (error) {
    console.error('Error al cerrar sesión:', error);
    mostrarToast('❌ Error al cerrar sesión', 'error');
    cerrarConfirmLogout();
  }
}

// ============ ACTUALIZAR RENDER TABLA ============
function renderTabla(activosFiltrados) {
  const tbody = document.getElementById('activosTable');
  const puedeEditar = currentUser && (currentUser.rol === 'admin' || currentUser.rol === 'editor');
  const esAdmin = currentUser && currentUser.rol === 'admin';
  const esViewer = currentUser && currentUser.rol === 'viewer';
  
  // Ocultar/mostrar columna de acciones
  const thead = document.querySelector('thead tr');
  if (thead) {
    const ths = thead.querySelectorAll('th');
    if (ths.length >= 8) {
      ths[ths.length - 1].style.display = esViewer ? 'none' : '';
    }
  }
  
  if (activosFiltrados.length === 0) {
    const colspan = esViewer ? 7 : 8;
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="loading">No hay activos registrados</td></tr>`;
    return;
  }

  tbody.innerHTML = activosFiltrados.map(activo => {
    let acciones = '';
    
    if (!esViewer) {
      acciones += `<button class="btn-qr" onclick="generarQR('${activo.codigo}')">📱 QR</button>`;
      
      if (puedeEditar) {
        acciones += ` <button class="btn-edit" onclick="editarActivo(${activo.id})">✏️</button>`;
      }
      
      if (esAdmin) {
        acciones += ` <button class="btn-delete" onclick="eliminarActivo(${activo.id})">🗑️</button>`;
      }
    }
    
    if (esViewer) {
      acciones = `<button class="btn-qr" onclick="generarQR('${activo.codigo}')">📱 QR</button>`;
    }
    
    // Generar miniaturas de imágenes
    let imagenesHTML = '';
    if (activo.imagen_equipo) {
      imagenesHTML += `<img src="${activo.imagen_equipo}" class="activo-imagen-thumb" alt="Equipo" title="Ver equipo">`;
    }
    if (activo.imagen_serial) {
      imagenesHTML += `<img src="${activo.imagen_serial}" class="activo-imagen-thumb" alt="Serial" title="Ver serial">`;
    }
    if (!imagenesHTML) {
      imagenesHTML = '-';
    }
    
    return `
      <tr>
        <td><strong>${activo.codigo}</strong></td>
        <td>${activo.nombre}</td>
        <td>${activo.categoria_nombre || '-'}</td>
        <td>${activo.empresa_nombre || 'Sin empresa'}</td>
        <td>${activo.responsable_nombre || '-'}</td>
        <td><span class="status-badge status-${activo.estado?.toLowerCase() || 'activo'}">${activo.estado || 'ACTIVO'}</span></td>
        <td>$${activo.valor_actual?.toLocaleString() || '0'}</td>
        <td ${esViewer ? 'style="display:none;"' : ''}>
          <div class="action-buttons">
            ${acciones}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ============ TOAST NOTIFICATIONS ============
function mostrarToast(mensaje, tipo = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo}`;
  toast.textContent = mensaje;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.5s';
    setTimeout(() => toast.remove(), 500);
  }, 3000);
}

// ============ INICIALIZACIÓN ============
document.addEventListener('DOMContentLoaded', async () => {
  const autenticado = await verificarSesion();
  if (autenticado) {
    await cargarEmpresas();
    await cargarCategorias();
    await cargarActivos();
    if (currentUser.rol === 'admin') {
      await cargarUsuarios();
    }
  }
});

// ============ EMPRESAS ============
async function cargarEmpresas() {
  try {
    const response = await fetch('/api/empresas');
    empresas = await response.json();
    
    const select = document.getElementById('empresa_id');
    select.innerHTML = '<option value="">Seleccionar empresa</option>';
    empresas.forEach(emp => {
      select.innerHTML += `<option value="${emp.id}" data-prefijo="${emp.prefijo || ''}">${emp.nombre} (${emp.prefijo || 'Sin prefijo'})</option>`;
    });

    const filter = document.getElementById('filterEmpresa');
    filter.innerHTML = '<option value="">Todas las empresas</option>';
    empresas.forEach(emp => {
      filter.innerHTML += `<option value="${emp.id}">${emp.nombre}</option>`;
    });
  } catch (error) {
    console.error('Error cargando empresas:', error);
    mostrarToast('Error al cargar empresas', 'error');
  }
}

// ============ CATEGORÍAS ============
async function cargarCategorias() {
  try {
    const response = await fetch('/api/categorias');
    categorias = await response.json();
    
    const select = document.getElementById('categoria_id');
    select.innerHTML = '<option value="">Seleccionar categoría</option>';
    categorias.forEach(cat => {
      select.innerHTML += `<option value="${cat.id}">${cat.nombre}</option>`;
    });

    const filter = document.getElementById('filterCategoria');
    filter.innerHTML = '<option value="">Todas las categorías</option>';
    categorias.forEach(cat => {
      filter.innerHTML += `<option value="${cat.id}">${cat.nombre}</option>`;
    });
  } catch (error) {
    console.error('Error cargando categorías:', error);
    mostrarToast('Error al cargar categorías', 'error');
  }
}

// ============ GENERAR CÓDIGO AUTOMÁTICO ============
async function generarCodigoAuto() {
  const empresaId = document.getElementById('empresa_id').value;
  const codigoInput = document.getElementById('codigo');
  
  if (!empresaId) {
    codigoInput.value = '';
    return;
  }

  try {
    const response = await fetch('/api/generar-codigo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empresa_id: empresaId })
    });

    if (response.ok) {
      const data = await response.json();
      codigoInput.value = data.codigo;
    }
  } catch (error) {
    console.error('Error generando código:', error);
    mostrarToast('Error al generar código', 'error');
  }
}

// ============ ACTIVOS ============
async function cargarActivos() {
  try {
    const response = await fetch('/api/activos');
    activos = await response.json();
    renderTabla(activos);
  } catch (error) {
    console.error('Error cargando activos:', error);
    mostrarToast('Error al cargar activos', 'error');
  }
}

function renderTabla(activosFiltrados) {
  const tbody = document.getElementById('activosTable');
  const puedeEditar = currentUser && (currentUser.rol === 'admin' || currentUser.rol === 'editor');
  const esAdmin = currentUser && currentUser.rol === 'admin';
  
  if (activosFiltrados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="loading">No hay activos registrados</td></tr>';
    return;
  }

  tbody.innerHTML = activosFiltrados.map(activo => {
    let acciones = `
      <button class="btn-qr" onclick="generarQR('${activo.codigo}')">📱 QR</button>
    `;
    
    if (puedeEditar) {
      acciones += ` <button class="btn-edit" onclick="editarActivo(${activo.id})">✏️</button>`;
    }
    
    if (esAdmin) {
      acciones += ` <button class="btn-delete" onclick="eliminarActivo(${activo.id})">🗑️</button>`;
    }
    
    return `
      <tr>
        <td><strong>${activo.codigo}</strong></td>
        <td>${activo.nombre}</td>
        <td>${activo.categoria_nombre || '-'}</td>
        <td>${activo.empresa_nombre || 'Sin empresa'}</td>
        <td>${activo.responsable_nombre || '-'}</td>
        <td><span class="status-badge status-${activo.estado?.toLowerCase() || 'activo'}">${activo.estado || 'ACTIVO'}</span></td>
        <td>$${activo.valor_actual?.toLocaleString() || '0'}</td>
        <td>
          <div class="action-buttons">
            ${acciones}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}


// ============ BÚSQUEDA ============
function buscarActivos() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const empresa = document.getElementById('filterEmpresa').value;
  const categoria = document.getElementById('filterCategoria').value;
  const estado = document.getElementById('filterEstado').value;

  const filtrados = activos.filter(activo => {
    const matchSearch = activo.codigo.toLowerCase().includes(search) ||
                        activo.nombre.toLowerCase().includes(search) ||
                        (activo.responsable_nombre && activo.responsable_nombre.toLowerCase().includes(search)) ||
                        (activo.empresa_nombre && activo.empresa_nombre.toLowerCase().includes(search));
    const matchEmpresa = !empresa || activo.empresa_id == empresa;
    const matchCategoria = !categoria || activo.categoria_id == categoria;
    const matchEstado = !estado || activo.estado === estado;
    return matchSearch && matchEmpresa && matchCategoria && matchEstado;
  });

  renderTabla(filtrados);
}

// ============ FORMULARIO ACTIVO ============
function mostrarFormulario() {
  document.getElementById('modalTitle').textContent = 'Registrar Nuevo Activo';
  document.getElementById('activoForm').reset();
  document.getElementById('activoId').value = '';
  document.getElementById('codigo').value = '';
  document.getElementById('modalForm').style.display = 'block';
}

function cerrarModal() {
  document.getElementById('modalForm').style.display = 'none';
}

async function guardarActivo(event) {
  event.preventDefault();
  
  const id = document.getElementById('activoId').value;
  
  // Crear FormData para enviar archivos
  const formData = new FormData();
  
  // Agregar todos los campos del formulario
  formData.append('codigo', document.getElementById('codigo').value);
  formData.append('nombre', document.getElementById('nombre').value);
  formData.append('descripcion', document.getElementById('descripcion').value);
  formData.append('categoria_id', document.getElementById('categoria_id').value || '');
  formData.append('empresa_id', document.getElementById('empresa_id').value);
  formData.append('estado', document.getElementById('estado').value);
  formData.append('fecha_adquisicion', document.getElementById('fecha_adquisicion').value || '');
  formData.append('ubicacion', document.getElementById('ubicacion').value);
  formData.append('valor_compra', document.getElementById('valor_compra').value || '0');
  formData.append('valor_actual', document.getElementById('valor_actual').value || '0');
  formData.append('proveedor', document.getElementById('proveedor').value);
  formData.append('numero_serie', document.getElementById('numero_serie').value);
  formData.append('garantia', document.getElementById('garantia').value);
  formData.append('responsable_nombre', document.getElementById('responsable_nombre').value);
  formData.append('responsable_cedula', document.getElementById('responsable_cedula').value);
  formData.append('responsable_cargo', document.getElementById('responsable_cargo').value);
  formData.append('responsable_telefono', document.getElementById('responsable_telefono').value);
  formData.append('responsable_email', document.getElementById('responsable_email').value);
  formData.append('fecha_asignacion', document.getElementById('fecha_asignacion').value || '');
  
  // Agregar imágenes si existen
  const imagenEquipo = document.getElementById('imagen_equipo');
  if (imagenEquipo.files && imagenEquipo.files[0]) {
    formData.append('imagen_equipo', imagenEquipo.files[0]);
  }
  
  const imagenSerial = document.getElementById('imagen_serial');
  if (imagenSerial.files && imagenSerial.files[0]) {
    formData.append('imagen_serial', imagenSerial.files[0]);
  }
  
  // Agregar imágenes existentes (para edición)
  const imagenEquipoActual = document.getElementById('imagen_equipo_actual').value;
  if (imagenEquipoActual) {
    formData.append('imagen_equipo_actual', imagenEquipoActual);
  }
  
  const imagenSerialActual = document.getElementById('imagen_serial_actual').value;
  if (imagenSerialActual) {
    formData.append('imagen_serial_actual', imagenSerialActual);
  }

  // Validaciones
  const codigo = formData.get('codigo');
  const nombre = formData.get('nombre');
  const empresa_id = formData.get('empresa_id');

  if (!codigo) {
    mostrarToast('Por favor, genera un código automático o ingresa uno manualmente', 'error');
    return;
  }

  if (!nombre) {
    mostrarToast('Por favor, ingresa el nombre del activo', 'error');
    return;
  }

  if (!empresa_id) {
    mostrarToast('Por favor, selecciona una empresa', 'error');
    return;
  }

  try {
    const url = id ? `/api/activos/${id}` : '/api/activos';
    const method = id ? 'PUT' : 'POST';
    
    const response = await fetch(url, {
      method: method,
      body: formData
      // No incluir Content-Type, fetch lo establece automáticamente con FormData
    });

    if (response.ok) {
      cerrarModal();
      cargarActivos();
      mostrarToast(id ? '✅ Activo actualizado correctamente' : '✅ Activo registrado correctamente');
    } else {
      const error = await response.json();
      mostrarToast('❌ Error: ' + (error.error || 'Error al guardar'), 'error');
    }
  } catch (error) {
    console.error('Error guardando activo:', error);
    mostrarToast('❌ Error al guardar el activo', 'error');
  }
}

function editarActivo(id) {
  const activo = activos.find(a => a.id === id);
  if (!activo) return;

  document.getElementById('modalTitle').textContent = 'Editar Activo';
  document.getElementById('activoId').value = activo.id;
  document.getElementById('codigo').value = activo.codigo;
  document.getElementById('nombre').value = activo.nombre;
  document.getElementById('descripcion').value = activo.descripcion || '';
  document.getElementById('categoria_id').value = activo.categoria_id || '';
  document.getElementById('empresa_id').value = activo.empresa_id || '';
  document.getElementById('estado').value = activo.estado || 'ACTIVO';
  document.getElementById('fecha_adquisicion').value = activo.fecha_adquisicion || '';
  document.getElementById('ubicacion').value = activo.ubicacion || '';
  document.getElementById('valor_compra').value = activo.valor_compra || '';
  document.getElementById('valor_actual').value = activo.valor_actual || '';
  document.getElementById('proveedor').value = activo.proveedor || '';
  document.getElementById('numero_serie').value = activo.numero_serie || '';
  document.getElementById('garantia').value = activo.garantia || '';
  document.getElementById('responsable_nombre').value = activo.responsable_nombre || '';
  document.getElementById('responsable_cedula').value = activo.responsable_cedula || '';
  document.getElementById('responsable_cargo').value = activo.responsable_cargo || '';
  document.getElementById('responsable_telefono').value = activo.responsable_telefono || '';
  document.getElementById('responsable_email').value = activo.responsable_email || '';
  document.getElementById('fecha_asignacion').value = activo.fecha_asignacion || '';

  // Limpiar previsualizaciones
  document.getElementById('preview_equipo').innerHTML = '';
  document.getElementById('preview_serial').innerHTML = '';
  document.getElementById('imagen_equipo').value = '';
  document.getElementById('imagen_serial').value = '';
  
  // Cargar imágenes existentes
  cargarImagenesExistentes(activo);

  document.getElementById('modalForm').style.display = 'block';
}

async function eliminarActivo(id) {
  if (!confirm('¿Estás seguro de eliminar este activo?')) return;
  
  try {
    const response = await fetch(`/api/activos/${id}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      cargarActivos();
      mostrarToast('✅ Activo eliminado correctamente');
    } else {
      const error = await response.json();
      mostrarToast('❌ Error: ' + error.error, 'error');
    }
  } catch (error) {
    console.error('Error eliminando activo:', error);
    mostrarToast('❌ Error al eliminar el activo', 'error');
  }
}


// ============ QR ============
let qrData = null;

async function generarQR(codigo) {
  try {
    const response = await fetch(`/api/qr/${codigo}`);
    const data = await response.json();
    
    if (data.qr) {
      qrData = data;
      document.getElementById('qrImage').src = data.qr;
      document.getElementById('qrCodigo').textContent = codigo;
      
      const activo = activos.find(a => a.codigo === codigo);
      if (activo) {
        document.getElementById('qrNombre').textContent = activo.nombre;
        const empresa = empresas.find(e => e.id === activo.empresa_id);
        document.getElementById('qrEmpresa').textContent = empresa ? empresa.nombre : 'Sin empresa';
        document.getElementById('qrResponsable').textContent = activo.responsable_nombre || 'Sin responsable asignado';
      }
      
      document.getElementById('modalQR').style.display = 'block';
    }
  } catch (error) {
    console.error('Error generando QR:', error);
    mostrarToast('❌ Error al generar el código QR', 'error');
  }
}

function cerrarModalQR() {
  document.getElementById('modalQR').style.display = 'none';
}

function imprimirQR() {
  const img = document.getElementById('qrImage');
  const ventana = window.open('', '_blank');
  ventana.document.write(`
    <html>
      <head><title>QR - ${document.getElementById('qrCodigo').textContent}</title></head>
      <body style="display:flex;justify-content:center;align-items:center;height:100vh;flex-direction:column;font-family:Arial">
        <img src="${img.src}" style="max-width:300px">
        <h3>Código: ${document.getElementById('qrCodigo').textContent}</h3>
        <p>${document.getElementById('qrNombre').textContent}</p>
        <p>${document.getElementById('qrEmpresa').textContent}</p>
        <p>Responsable: ${document.getElementById('qrResponsable').textContent}</p>
        <script>
          window.onload = function() { window.print(); }
        <\/script>
      </body>
    </html>
  `);
}

function descargarQR() {
  const img = document.getElementById('qrImage');
  const link = document.createElement('a');
  link.download = `QR-${document.getElementById('qrCodigo').textContent}.png`;
  link.href = img.src;
  link.click();
}

// ============ GESTIÓN DE EMPRESAS (CON MODALES) ============
function mostrarEmpresas() {
  renderEmpresas();
  document.getElementById('modalEmpresas').style.display = 'block';
}

function cerrarModalEmpresas() {
  document.getElementById('modalEmpresas').style.display = 'none';
}

// ============ RENDER EMPRESAS ACTUALIZADO ============
function renderEmpresas() {
  const container = document.getElementById('empresasList');
  const puedeEditar = currentUser && (currentUser.rol === 'admin' || currentUser.rol === 'editor');
  const esAdmin = currentUser && currentUser.rol === 'admin';
  const esViewer = currentUser && currentUser.rol === 'viewer';
  
  // Mostrar/ocultar botón nueva empresa
  const btnNuevaEmpresa = document.getElementById('btnNuevaEmpresa');
  if (btnNuevaEmpresa) {
    btnNuevaEmpresa.style.display = puedeEditar ? 'inline-flex' : 'none';
  }
  
  if (empresas.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">No hay empresas registradas</p>';
    return;
  }

  container.innerHTML = empresas.map(emp => {
    let acciones = '';
    
    // Si es viewer, no mostrar botones de acción
    if (!esViewer) {
      if (puedeEditar) {
        acciones += `<button class="btn-edit" onclick="mostrarFormularioEmpresa(${emp.id})">✏️</button>`;
      }
      if (esAdmin) {
        acciones += `<button class="btn-delete" onclick="mostrarConfirmEliminarEmpresa(${emp.id})">🗑️</button>`;
      }
    }
    
    return `
      <div class="item-list">
        <div class="item-info">
          <strong>${emp.nombre}</strong>
          <small>
            Prefijo: ${emp.prefijo || 'Sin prefijo'} | 
            NIT: ${emp.nit || 'N/A'} | 
            Tel: ${emp.telefono || 'N/A'}
          </small>
        </div>
        <div class="item-actions">
          ${acciones}
        </div>
      </div>
    `;
  }).join('');
}

// Formulario Empresa
function mostrarFormularioEmpresa(id = null) {
  if (id) {
    const empresa = empresas.find(e => e.id === id);
    if (!empresa) return;
    
    document.getElementById('modalEmpresaTitle').textContent = 'Editar Empresa';
    document.getElementById('empresaId').value = empresa.id;
    document.getElementById('empresaNombre').value = empresa.nombre;
    document.getElementById('empresaNit').value = empresa.nit || '';
    document.getElementById('empresaTelefono').value = empresa.telefono || '';
    document.getElementById('empresaDireccion').value = empresa.direccion || '';
    document.getElementById('empresaPrefijo').value = empresa.prefijo || '';
  } else {
    document.getElementById('modalEmpresaTitle').textContent = 'Nueva Empresa';
    document.getElementById('empresaForm').reset();
    document.getElementById('empresaId').value = '';
    document.getElementById('empresaPrefijo').value = '';
  }
  
  document.getElementById('modalFormEmpresa').style.display = 'block';
}

function cerrarFormularioEmpresa() {
  document.getElementById('modalFormEmpresa').style.display = 'none';
}

async function guardarEmpresaForm(event) {
  event.preventDefault();
  
  const id = document.getElementById('empresaId').value;
  const data = {
    nombre: document.getElementById('empresaNombre').value,
    nit: document.getElementById('empresaNit').value,
    telefono: document.getElementById('empresaTelefono').value,
    direccion: document.getElementById('empresaDireccion').value,
    prefijo: document.getElementById('empresaPrefijo').value || document.getElementById('empresaNombre').value.substring(0, 3).toUpperCase()
  };
  
  try {
    const url = id ? `/api/empresas/${id}` : '/api/empresas';
    const method = id ? 'PUT' : 'POST';
    
    const response = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      cerrarFormularioEmpresa();
      await cargarEmpresas();
      renderEmpresas();
      mostrarToast(id ? '✅ Empresa actualizada correctamente' : '✅ Empresa agregada correctamente');
    } else {
      const error = await response.json();
      mostrarToast('❌ Error: ' + error.error, 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    mostrarToast('❌ Error al guardar la empresa', 'error');
  }
}

// Confirmación eliminar empresa
function mostrarConfirmEliminarEmpresa(id) {
  const empresa = empresas.find(e => e.id === id);
  if (!empresa) return;
  
  empresaAEliminar = id;
  document.getElementById('confirmEmpresaMsg').innerHTML = `
    ¿Estás seguro de eliminar la empresa <strong>"${empresa.nombre}"</strong>?
    <br><br>
    <span style="color:#c62828;font-size:14px;">⚠️ Esta acción no se puede deshacer</span>
  `;
  document.getElementById('modalConfirmEmpresa').style.display = 'block';
}

function cerrarConfirmEmpresa() {
  document.getElementById('modalConfirmEmpresa').style.display = 'none';
  empresaAEliminar = null;
}

async function confirmarEliminarEmpresa() {
  if (!empresaAEliminar) return;
  
  try {
    const response = await fetch(`/api/empresas/${empresaAEliminar}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      cerrarConfirmEmpresa();
      await cargarEmpresas();
      renderEmpresas();
      mostrarToast('✅ Empresa eliminada correctamente');
    } else {
      const error = await response.json();
      cerrarConfirmEmpresa();
      mostrarToast('❌ Error: ' + error.error, 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    mostrarToast('❌ Error al eliminar la empresa', 'error');
  }
}



// ============ GESTIÓN DE USUARIOS (Solo admin) ============
async function cargarUsuarios() {
  try {
    const response = await fetch('/api/usuarios');
    usuarios = await response.json();
  } catch (error) {
    console.error('Error cargando usuarios:', error);
  }
}

function mostrarUsuarios() {
  renderUsuarios();
  document.getElementById('modalUsuarios').style.display = 'block';
}

function cerrarModalUsuarios() {
  document.getElementById('modalUsuarios').style.display = 'none';
}

function renderUsuarios() {
  const container = document.getElementById('usuariosList');
  
  if (usuarios.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">No hay usuarios registrados</p>';
    return;
  }

  container.innerHTML = usuarios.map(user => {
    const esActual = user.id === currentUser.id;
    return `
      <div class="item-list">
        <div class="item-info">
          <strong>${user.nombre}</strong>
          <small>
            Usuario: ${user.username} | 
            Rol: ${user.rol.toUpperCase()} | 
            Estado: ${user.activo ? '✅ Activo' : '❌ Inactivo'}
            ${esActual ? ' 👈 (Tú)' : ''}
          </small>
        </div>
        <div class="item-actions">
          <button class="btn-edit" onclick="mostrarFormularioUsuario(${user.id})">✏️</button>
          ${!esActual ? `<button class="btn-delete" onclick="mostrarConfirmEliminarUsuario(${user.id})">🗑️</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function mostrarFormularioUsuario(id = null) {
  if (id) {
    const user = usuarios.find(u => u.id === id);
    if (!user) return;
    
    document.getElementById('modalUsuarioTitle').textContent = 'Editar Usuario';
    document.getElementById('usuarioId').value = user.id;
    document.getElementById('usuarioUsername').value = user.username;
    document.getElementById('usuarioNombre').value = user.nombre;
    document.getElementById('usuarioEmail').value = user.email || '';
    document.getElementById('usuarioPassword').value = '';
    document.getElementById('usuarioPassword').placeholder = 'Dejar en blanco para no cambiar';
    document.getElementById('usuarioRol').value = user.rol;
    document.getElementById('usuarioActivo').value = user.activo;
  } else {
    document.getElementById('modalUsuarioTitle').textContent = 'Nuevo Usuario';
    document.getElementById('usuarioForm').reset();
    document.getElementById('usuarioId').value = '';
    document.getElementById('usuarioPassword').placeholder = 'Contraseña (requerida para nuevo usuario)';
    document.getElementById('usuarioActivo').value = '1';
  }
  
  document.getElementById('modalFormUsuario').style.display = 'block';
}

function cerrarFormularioUsuario() {
  document.getElementById('modalFormUsuario').style.display = 'none';
}

async function guardarUsuarioForm(event) {
  event.preventDefault();
  
  const id = document.getElementById('usuarioId').value;
  const password = document.getElementById('usuarioPassword').value;
  
  // Validar contraseña para nuevo usuario
  if (!id && !password) {
    mostrarToast('La contraseña es requerida para nuevos usuarios', 'error');
    return;
  }
  
  if (password && password.length < 6) {
    mostrarToast('La contraseña debe tener al menos 6 caracteres', 'error');
    return;
  }
  
  const data = {
    username: document.getElementById('usuarioUsername').value,
    nombre: document.getElementById('usuarioNombre').value,
    email: document.getElementById('usuarioEmail').value,
    rol: document.getElementById('usuarioRol').value,
    activo: parseInt(document.getElementById('usuarioActivo').value)
  };
  
  if (password) {
    data.password = password;
  }
  
  try {
    const url = id ? `/api/usuarios/${id}` : '/api/usuarios';
    const method = id ? 'PUT' : 'POST';
    
    const response = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      cerrarFormularioUsuario();
      await cargarUsuarios();
      renderUsuarios();
      mostrarToast(id ? '✅ Usuario actualizado correctamente' : '✅ Usuario creado correctamente');
    } else {
      const error = await response.json();
      mostrarToast('❌ Error: ' + error.error, 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    mostrarToast('❌ Error al guardar el usuario', 'error');
  }
}

function mostrarConfirmEliminarUsuario(id) {
  const user = usuarios.find(u => u.id === id);
  if (!user) return;
  
  usuarioAEliminar = id;
  document.getElementById('confirmUsuarioMsg').innerHTML = `
    ¿Estás seguro de eliminar al usuario <strong>"${user.nombre}"</strong>?
    <br><br>
    <span style="color:#c62828;font-size:14px;">⚠️ Esta acción no se puede deshacer</span>
  `;
  document.getElementById('modalConfirmUsuario').style.display = 'block';
}

function cerrarConfirmUsuario() {
  document.getElementById('modalConfirmUsuario').style.display = 'none';
  usuarioAEliminar = null;
}

async function confirmarEliminarUsuario() {
  if (!usuarioAEliminar) return;
  
  try {
    const response = await fetch(`/api/usuarios/${usuarioAEliminar}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      cerrarConfirmUsuario();
      await cargarUsuarios();
      renderUsuarios();
      mostrarToast('✅ Usuario eliminado correctamente');
    } else {
      const error = await response.json();
      cerrarConfirmUsuario();
      mostrarToast('❌ Error: ' + error.error, 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    mostrarToast('❌ Error al eliminar el usuario', 'error');
  }
}

// ============ CIERRE DE MODALES CON CLICK FUERA ============
window.onclick = function(event) {
  if (event.target.classList.contains('modal')) {
    event.target.style.display = 'none';
  }
};

document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape') {
    document.querySelectorAll('.modal').forEach(modal => {
      modal.style.display = 'none';
    });
  }
});

// ============ GESTIÓN DE CATEGORÍAS (CON MODALES) ============
function mostrarCategorias() {
  renderCategorias();
  document.getElementById('modalCategorias').style.display = 'block';
}

function cerrarModalCategorias() {
  document.getElementById('modalCategorias').style.display = 'none';
}

// ============ RENDER CATEGORÍAS ACTUALIZADO ============
function renderCategorias() {
  const container = document.getElementById('categoriasList');
  const puedeEditar = currentUser && (currentUser.rol === 'admin' || currentUser.rol === 'editor');
  const esAdmin = currentUser && currentUser.rol === 'admin';
  const esViewer = currentUser && currentUser.rol === 'viewer';
  
  // Mostrar/ocultar botón nueva categoría
  const btnNuevaCategoria = document.getElementById('btnNuevaCategoria');
  if (btnNuevaCategoria) {
    btnNuevaCategoria.style.display = puedeEditar ? 'inline-flex' : 'none';
  }
  
  if (categorias.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">No hay categorías registradas</p>';
    return;
  }

  container.innerHTML = categorias.map(cat => {
    let acciones = '';
    
    // Si es viewer, no mostrar botones de acción
    if (!esViewer) {
      if (puedeEditar) {
        acciones += `<button class="btn-edit" onclick="mostrarFormularioCategoria(${cat.id})">✏️</button>`;
      }
      if (esAdmin) {
        acciones += `<button class="btn-delete" onclick="mostrarConfirmEliminarCategoria(${cat.id})">🗑️</button>`;
      }
    }
    
    return `
      <div class="item-list">
        <div class="item-info">
          <strong>${cat.nombre}</strong>
          <small>${cat.descripcion || 'Sin descripción'}</small>
        </div>
        <div class="item-actions">
          ${acciones}
        </div>
      </div>
    `;
  }).join('');
}

// Formulario Categoría
function mostrarFormularioCategoria(id = null) {
  if (id) {
    const categoria = categorias.find(c => c.id === id);
    if (!categoria) return;
    
    document.getElementById('modalCategoriaTitle').textContent = 'Editar Categoría';
    document.getElementById('categoriaId').value = categoria.id;
    document.getElementById('categoriaNombre').value = categoria.nombre;
    document.getElementById('categoriaDescripcion').value = categoria.descripcion || '';
  } else {
    document.getElementById('modalCategoriaTitle').textContent = 'Nueva Categoría';
    document.getElementById('categoriaForm').reset();
    document.getElementById('categoriaId').value = '';
  }
  
  document.getElementById('modalFormCategoria').style.display = 'block';
}

function cerrarFormularioCategoria() {
  document.getElementById('modalFormCategoria').style.display = 'none';
}

async function guardarCategoriaForm(event) {
  event.preventDefault();
  
  const id = document.getElementById('categoriaId').value;
  const data = {
    nombre: document.getElementById('categoriaNombre').value,
    descripcion: document.getElementById('categoriaDescripcion').value
  };
  
  try {
    const url = id ? `/api/categorias/${id}` : '/api/categorias';
    const method = id ? 'PUT' : 'POST';
    
    const response = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      cerrarFormularioCategoria();
      await cargarCategorias();
      renderCategorias();
      mostrarToast(id ? '✅ Categoría actualizada correctamente' : '✅ Categoría agregada correctamente');
    } else {
      const error = await response.json();
      mostrarToast('❌ Error: ' + error.error, 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    mostrarToast('❌ Error al guardar la categoría', 'error');
  }
}

// Confirmación eliminar categoría
function mostrarConfirmEliminarCategoria(id) {
  const categoria = categorias.find(c => c.id === id);
  if (!categoria) return;
  
  categoriaAEliminar = id;
  document.getElementById('confirmCategoriaMsg').innerHTML = `
    ¿Estás seguro de eliminar la categoría <strong>"${categoria.nombre}"</strong>?
    <br><br>
    <span style="color:#c62828;font-size:14px;">⚠️ Esta acción no se puede deshacer</span>
  `;
  document.getElementById('modalConfirmCategoria').style.display = 'block';
}

function cerrarConfirmCategoria() {
  document.getElementById('modalConfirmCategoria').style.display = 'none';
  categoriaAEliminar = null;
}

async function confirmarEliminarCategoria() {
  if (!categoriaAEliminar) return;
  
  try {
    const response = await fetch(`/api/categorias/${categoriaAEliminar}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      cerrarConfirmCategoria();
      await cargarCategorias();
      renderCategorias();
      mostrarToast('✅ Categoría eliminada correctamente');
    } else {
      const error = await response.json();
      cerrarConfirmCategoria();
      mostrarToast('❌ Error: ' + error.error, 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    mostrarToast('❌ Error al eliminar la categoría', 'error');
  }
}

// ============ CIERRE DE MODALES CON CLICK FUERA ============
window.onclick = function(event) {
  if (event.target.classList.contains('modal')) {
    event.target.style.display = 'none';
  }
};

// Cerrar modales con tecla ESC
document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape') {
    document.querySelectorAll('.modal').forEach(modal => {
      modal.style.display = 'none';
    });
  }
});

// ============ FUNCIONES PARA IMÁGENES ============

// Previsualizar imagen antes de subir
function previewImage(input, previewId) {
  const preview = document.getElementById(previewId);
  preview.innerHTML = '';
  
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
      const img = document.createElement('img');
      img.src = e.target.result;
      img.alt = 'Vista previa';
      
      const container = document.createElement('div');
      container.className = 'remove-image';
      
      const removeBtn = document.createElement('button');
      removeBtn.innerHTML = '✕';
      removeBtn.type = 'button';
      removeBtn.onclick = function() {
        preview.innerHTML = '';
        input.value = '';
        // Si es edición, también limpiar el campo oculto
        if (input.id === 'imagen_equipo') {
          document.getElementById('imagen_equipo_actual').value = '';
        } else if (input.id === 'imagen_serial') {
          document.getElementById('imagen_serial_actual').value = '';
        }
      };
      
      container.appendChild(img);
      container.appendChild(removeBtn);
      preview.appendChild(container);
    };
    
    reader.readAsDataURL(input.files[0]);
  }
}

// Cargar imágenes existentes al editar
function cargarImagenesExistentes(activo) {
  // Imagen del equipo
  if (activo.imagen_equipo) {
    const preview = document.getElementById('preview_equipo');
    preview.innerHTML = '';
    const img = document.createElement('img');
    img.src = activo.imagen_equipo;
    img.alt = 'Foto del equipo';
    
    const container = document.createElement('div');
    container.className = 'remove-image';
    
    const removeBtn = document.createElement('button');
    removeBtn.innerHTML = '✕';
    removeBtn.type = 'button';
    removeBtn.onclick = function() {
      preview.innerHTML = '';
      document.getElementById('imagen_equipo_actual').value = '';
      document.getElementById('imagen_equipo').value = '';
    };
    
    container.appendChild(img);
    container.appendChild(removeBtn);
    preview.appendChild(container);
    document.getElementById('imagen_equipo_actual').value = activo.imagen_equipo;
  }
  
  // Imagen del serial
  if (activo.imagen_serial) {
    const preview = document.getElementById('preview_serial');
    preview.innerHTML = '';
    const img = document.createElement('img');
    img.src = activo.imagen_serial;
    img.alt = 'Foto del serial';
    
    const container = document.createElement('div');
    container.className = 'remove-image';
    
    const removeBtn = document.createElement('button');
    removeBtn.innerHTML = '✕';
    removeBtn.type = 'button';
    removeBtn.onclick = function() {
      preview.innerHTML = '';
      document.getElementById('imagen_serial_actual').value = '';
      document.getElementById('imagen_serial').value = '';
    };
    
    container.appendChild(img);
    container.appendChild(removeBtn);
    preview.appendChild(container);
    document.getElementById('imagen_serial_actual').value = activo.imagen_serial;
  }
}