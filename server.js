const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const QRCode = require('qrcode');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configuración de sesión
app.use(session({
  secret: 'tu_clave_secreta_muy_segura_cambia_esto',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// ============ CONFIGURACIÓN DE MULTER PARA IMÁGENES ============

// Crear carpetas para imágenes si no existen
const uploadDir = path.join(__dirname, 'public', 'uploads');
const equipoDir = path.join(uploadDir, 'equipo');
const serialDir = path.join(uploadDir, 'serial');

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(equipoDir)) fs.mkdirSync(equipoDir, { recursive: true });
if (!fs.existsSync(serialDir)) fs.mkdirSync(serialDir, { recursive: true });

// Configurar almacenamiento de multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Determinar carpeta según el tipo de imagen
    if (file.fieldname === 'imagen_equipo') {
      cb(null, equipoDir);
    } else if (file.fieldname === 'imagen_serial') {
      cb(null, serialDir);
    } else {
      cb(null, uploadDir);
    }
  },
  filename: function (req, file, cb) {
    // Generar nombre único: timestamp + código + original
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + extension);
  }
});

// Filtro de archivos (solo imágenes)
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten imágenes (JPEG, PNG, GIF, WEBP)'), false);
  }
};

// Configurar multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB máximo
  },
  fileFilter: fileFilter
});

// Middleware para servir archivos estáticos desde uploads
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// ============ CONEXIÓN A BASE DE DATOS ============

const db = new sqlite3.Database('./inventario.db');

// Crear tablas
db.serialize(() => {
  // Tabla de usuarios (igual que antes)
  db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nombre TEXT NOT NULL,
      email TEXT,
      rol TEXT NOT NULL DEFAULT 'viewer',
      activo INTEGER DEFAULT 1,
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insertar usuario admin por defecto
  const adminPassword = bcrypt.hashSync('admin123', 10);
  db.run(`
    INSERT OR IGNORE INTO usuarios (username, password, nombre, email, rol) 
    VALUES ('admin', ?, 'Administrador', 'admin@empresa.com', 'admin')
  `, [adminPassword]);

  const viewerPassword = bcrypt.hashSync('viewer123', 10);
  db.run(`
    INSERT OR IGNORE INTO usuarios (username, password, nombre, email, rol) 
    VALUES ('viewer', ?, 'Usuario Visualizador', 'viewer@empresa.com', 'viewer')
  `, [viewerPassword]);

  // Tabla de empresas
  db.run(`
    CREATE TABLE IF NOT EXISTS empresas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      nit TEXT,
      direccion TEXT,
      telefono TEXT,
      email TEXT,
      prefijo TEXT,
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabla de categorías
  db.run(`
    CREATE TABLE IF NOT EXISTS categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      descripcion TEXT,
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insertar categorías por defecto
  db.run(`
    INSERT OR IGNORE INTO categorias (nombre, descripcion) VALUES 
      ('Computadoras', 'Equipos de cómputo y periféricos'),
      ('Mobiliario', 'Muebles y enseres de oficina'),
      ('Vehículos', 'Automóviles y vehículos de transporte'),
      ('Maquinaria', 'Maquinaria y equipos industriales'),
      ('Herramientas', 'Herramientas y equipos manuales'),
      ('Electrónicos', 'Equipos electrónicos y de comunicación'),
      ('Inmuebles', 'Propiedades y edificaciones'),
      ('Software', 'Licencias y software especializado')
  `);

  // Tabla de activos (con campos para imágenes)
  db.run(`
    CREATE TABLE IF NOT EXISTS activos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      categoria_id INTEGER,
      empresa_id INTEGER,
      fecha_adquisicion DATE,
      valor_compra DECIMAL(10,2),
      valor_actual DECIMAL(10,2),
      estado TEXT,
      ubicacion TEXT,
      proveedor TEXT,
      garantia TEXT,
      numero_serie TEXT,
      responsable_nombre TEXT,
      responsable_cedula TEXT,
      responsable_cargo TEXT,
      responsable_telefono TEXT,
      responsable_email TEXT,
      fecha_asignacion DATE,
      imagen_equipo TEXT,
      imagen_serial TEXT,
      FOREIGN KEY (empresa_id) REFERENCES empresas(id),
      FOREIGN KEY (categoria_id) REFERENCES categorias(id)
    )
  `);

  // Tabla de movimientos
  db.run(`
    CREATE TABLE IF NOT EXISTS movimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activo_id INTEGER,
      fecha DATE,
      tipo TEXT,
      descripcion TEXT,
      usuario TEXT,
      FOREIGN KEY (activo_id) REFERENCES activos(id)
    )
  `);

  // Tabla de contador para códigos automáticos
  db.run(`
    CREATE TABLE IF NOT EXISTS contador_codigos (
      empresa_id INTEGER PRIMARY KEY,
      ultimo_numero INTEGER DEFAULT 0,
      FOREIGN KEY (empresa_id) REFERENCES empresas(id)
    )
  `);
});

// ============ MIDDLEWARE DE AUTENTICACIÓN ============

function isAuthenticated(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.status(401).json({ error: 'No autenticado' });
  }
}

function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.rol === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Permisos insuficientes' });
  }
}

function canWrite(req, res, next) {
  if (req.session.user && (req.session.user.rol === 'admin' || req.session.user.rol === 'editor')) {
    next();
  } else {
    res.status(403).json({ error: 'Permisos insuficientes para esta acción' });
  }
}

// ============ ENDPOINTS DE AUTENTICACIÓN ============

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  db.get('SELECT * FROM usuarios WHERE username = ? AND activo = 1', [username], (err, user) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }
    
    const passwordMatch = bcrypt.compareSync(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }
    
    req.session.user = {
      id: user.id,
      username: user.username,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol
    };
    
    res.json({
      success: true,
      user: req.session.user
    });
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', (req, res) => {
  if (req.session.user) {
    res.json({ user: req.session.user });
  } else {
    res.status(401).json({ error: 'No autenticado' });
  }
});

// ============ ENDPOINTS USUARIOS ============

app.get('/api/usuarios', isAdmin, (req, res) => {
  db.all('SELECT id, username, nombre, email, rol, activo, fecha_creacion FROM usuarios', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/usuarios', isAdmin, (req, res) => {
  const { username, password, nombre, email, rol } = req.body;
  
  if (!username || !password || !nombre) {
    return res.status(400).json({ error: 'Usuario, contraseña y nombre son requeridos' });
  }
  
  const hashedPassword = bcrypt.hashSync(password, 10);
  
  db.run(
    'INSERT INTO usuarios (username, password, nombre, email, rol) VALUES (?, ?, ?, ?, ?)',
    [username, hashedPassword, nombre, email || '', rol || 'viewer'],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(400).json({ error: 'El nombre de usuario ya existe' });
        }
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID });
    }
  );
});

app.put('/api/usuarios/:id', isAdmin, (req, res) => {
  const { username, nombre, email, rol, activo, password } = req.body;
  
  let query = 'UPDATE usuarios SET username = ?, nombre = ?, email = ?, rol = ?, activo = ?';
  let params = [username, nombre, email, rol, activo];
  
  if (password && password.trim() !== '') {
    query += ', password = ?';
    params.push(bcrypt.hashSync(password, 10));
  }
  
  query += ' WHERE id = ?';
  params.push(req.params.id);
  
  db.run(query, params, function(err) {
    if (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(400).json({ error: 'El nombre de usuario ya existe' });
      }
      return res.status(500).json({ error: err.message });
    }
    res.json({ updated: this.changes });
  });
});

app.delete('/api/usuarios/:id', isAdmin, (req, res) => {
  if (req.params.id == req.session.user.id) {
    return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
  }
  
  db.run('DELETE FROM usuarios WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

// ============ ENDPOINTS EMPRESAS ============

app.get('/api/empresas', isAuthenticated, (req, res) => {
  db.all('SELECT * FROM empresas ORDER BY nombre', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/empresas', canWrite, (req, res) => {
  const { nombre, nit, direccion, telefono, email, prefijo } = req.body;
  db.run(
    'INSERT INTO empresas (nombre, nit, direccion, telefono, email, prefijo) VALUES (?, ?, ?, ?, ?, ?)',
    [nombre, nit, direccion, telefono, email, prefijo || nombre.substring(0, 3).toUpperCase()],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      db.run('INSERT INTO contador_codigos (empresa_id, ultimo_numero) VALUES (?, 0)', [this.lastID]);
      
      res.json({ id: this.lastID });
    }
  );
});

app.put('/api/empresas/:id', canWrite, (req, res) => {
  const { nombre, nit, direccion, telefono, email, prefijo } = req.body;
  db.run(
    'UPDATE empresas SET nombre = ?, nit = ?, direccion = ?, telefono = ?, email = ?, prefijo = ? WHERE id = ?',
    [nombre, nit, direccion, telefono, email, prefijo, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes });
    }
  );
});

app.delete('/api/empresas/:id', isAdmin, (req, res) => {
  db.get('SELECT COUNT(*) as count FROM activos WHERE empresa_id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row.count > 0) {
      return res.status(400).json({ error: 'No se puede eliminar: la empresa tiene activos asociados' });
    }
    
    db.run('DELETE FROM empresas WHERE id = ?', [req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      db.run('DELETE FROM contador_codigos WHERE empresa_id = ?', [req.params.id]);
      res.json({ deleted: this.changes });
    });
  });
});

// ============ ENDPOINTS CATEGORÍAS ============

app.get('/api/categorias', isAuthenticated, (req, res) => {
  db.all('SELECT * FROM categorias ORDER BY nombre', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/categorias', canWrite, (req, res) => {
  const { nombre, descripcion } = req.body;
  db.run(
    'INSERT INTO categorias (nombre, descripcion) VALUES (?, ?)',
    [nombre, descripcion || ''],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(400).json({ error: 'Esta categoría ya existe' });
        }
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID });
    }
  );
});

app.put('/api/categorias/:id', canWrite, (req, res) => {
  const { nombre, descripcion } = req.body;
  db.run(
    'UPDATE categorias SET nombre = ?, descripcion = ? WHERE id = ?',
    [nombre, descripcion, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes });
    }
  );
});

app.delete('/api/categorias/:id', isAdmin, (req, res) => {
  db.get('SELECT COUNT(*) as count FROM activos WHERE categoria_id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row.count > 0) {
      return res.status(400).json({ error: 'No se puede eliminar: la categoría tiene activos asociados' });
    }
    
    db.run('DELETE FROM categorias WHERE id = ?', [req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ deleted: this.changes });
    });
  });
});

// ============ ENDPOINTS ACTIVOS (CON IMÁGENES) ============

// Generar código automático
app.post('/api/generar-codigo', isAuthenticated, (req, res) => {
  const { empresa_id } = req.body;
  
  db.get('SELECT prefijo FROM empresas WHERE id = ?', [empresa_id], (err, empresa) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
    
    const prefijo = empresa.prefijo || 'ACT';
    const año = new Date().getFullYear();
    
    db.run(
      'UPDATE contador_codigos SET ultimo_numero = ultimo_numero + 1 WHERE empresa_id = ?',
      [empresa_id],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        db.get('SELECT ultimo_numero FROM contador_codigos WHERE empresa_id = ?', [empresa_id], (err, row) => {
          if (err) return res.status(500).json({ error: err.message });
          const numero = String(row.ultimo_numero).padStart(4, '0');
          const codigo = `${prefijo}-${año}-${numero}`;
          res.json({ codigo });
        });
      }
    );
  });
});

// Obtener todos los activos
app.get('/api/activos', isAuthenticated, (req, res) => {
  const query = `
    SELECT a.*, e.nombre as empresa_nombre, e.prefijo,
           c.nombre as categoria_nombre
    FROM activos a
    LEFT JOIN empresas e ON a.empresa_id = e.id
    LEFT JOIN categorias c ON a.categoria_id = c.id
    ORDER BY a.id DESC
  `;
  db.all(query, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Obtener activo por código
app.get('/api/activos/:codigo', isAuthenticated, (req, res) => {
  const query = `
    SELECT a.*, e.nombre as empresa_nombre, e.prefijo,
           c.nombre as categoria_nombre
    FROM activos a
    LEFT JOIN empresas e ON a.empresa_id = e.id
    LEFT JOIN categorias c ON a.categoria_id = c.id
    WHERE a.codigo = ?
  `;
  db.get(query, [req.params.codigo], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Activo no encontrado' });
    res.json(row);
  });
});

// Crear activo (con imágenes)
app.post('/api/activos', canWrite, upload.fields([
  { name: 'imagen_equipo', maxCount: 1 },
  { name: 'imagen_serial', maxCount: 1 }
]), (req, res) => {
  const {
    codigo, nombre, descripcion, categoria_id, empresa_id,
    fecha_adquisicion, valor_compra, valor_actual,
    estado, ubicacion, proveedor, garantia, numero_serie,
    responsable_nombre, responsable_cedula, responsable_cargo,
    responsable_telefono, responsable_email, fecha_asignacion
  } = req.body;

  // Obtener rutas de las imágenes
  const imagen_equipo = req.files && req.files['imagen_equipo'] ? 
    '/uploads/equipo/' + req.files['imagen_equipo'][0].filename : null;
  const imagen_serial = req.files && req.files['imagen_serial'] ? 
    '/uploads/serial/' + req.files['imagen_serial'][0].filename : null;

  db.run(
    `INSERT INTO activos (
      codigo, nombre, descripcion, categoria_id, empresa_id,
      fecha_adquisicion, valor_compra, valor_actual,
      estado, ubicacion, proveedor, garantia, numero_serie,
      responsable_nombre, responsable_cedula, responsable_cargo,
      responsable_telefono, responsable_email, fecha_asignacion,
      imagen_equipo, imagen_serial
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      codigo, nombre, descripcion, categoria_id, empresa_id,
      fecha_adquisicion, valor_compra, valor_actual || valor_compra,
      estado, ubicacion, proveedor, garantia, numero_serie,
      responsable_nombre, responsable_cedula, responsable_cargo,
      responsable_telefono, responsable_email, fecha_asignacion,
      imagen_equipo, imagen_serial
    ],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

// Actualizar activo (con imágenes)
app.put('/api/activos/:id', canWrite, upload.fields([
  { name: 'imagen_equipo', maxCount: 1 },
  { name: 'imagen_serial', maxCount: 1 }
]), (req, res) => {
  const {
    codigo, nombre, descripcion, categoria_id, empresa_id,
    fecha_adquisicion, valor_compra, valor_actual,
    estado, ubicacion, proveedor, garantia, numero_serie,
    responsable_nombre, responsable_cedula, responsable_cargo,
    responsable_telefono, responsable_email, fecha_asignacion,
    imagen_equipo_actual, imagen_serial_actual
  } = req.body;

  // Determinar rutas de imágenes (mantener las existentes si no se suben nuevas)
  let imagen_equipo = imagen_equipo_actual || null;
  let imagen_serial = imagen_serial_actual || null;

  if (req.files && req.files['imagen_equipo']) {
    imagen_equipo = '/uploads/equipo/' + req.files['imagen_equipo'][0].filename;
  }

  if (req.files && req.files['imagen_serial']) {
    imagen_serial = '/uploads/serial/' + req.files['imagen_serial'][0].filename;
  }

  db.run(
    `UPDATE activos SET
      codigo = ?, nombre = ?, descripcion = ?, categoria_id = ?,
      empresa_id = ?, fecha_adquisicion = ?, valor_compra = ?,
      valor_actual = ?, estado = ?, ubicacion = ?,
      proveedor = ?, garantia = ?, numero_serie = ?,
      responsable_nombre = ?, responsable_cedula = ?,
      responsable_cargo = ?, responsable_telefono = ?,
      responsable_email = ?, fecha_asignacion = ?,
      imagen_equipo = ?, imagen_serial = ?
    WHERE id = ?`,
    [
      codigo, nombre, descripcion, categoria_id, empresa_id,
      fecha_adquisicion, valor_compra, valor_actual,
      estado, ubicacion, proveedor, garantia, numero_serie,
      responsable_nombre, responsable_cedula, responsable_cargo,
      responsable_telefono, responsable_email, fecha_asignacion,
      imagen_equipo, imagen_serial,
      req.params.id
    ],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes });
    }
  );
});

// Eliminar activo (también elimina las imágenes)
app.delete('/api/activos/:id', isAdmin, (req, res) => {
  // Primero obtener las rutas de las imágenes para eliminarlas
  db.get('SELECT imagen_equipo, imagen_serial FROM activos WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    
    // Eliminar archivos de imagen si existen
    if (row) {
      if (row.imagen_equipo) {
        const filePath = path.join(__dirname, 'public', row.imagen_equipo);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
      if (row.imagen_serial) {
        const filePath = path.join(__dirname, 'public', row.imagen_serial);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    }
    
    // Eliminar el registro de la base de datos
    db.run('DELETE FROM activos WHERE id = ?', [req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ deleted: this.changes });
    });
  });
});

// ============ QR ============
app.get('/api/qr/:codigo', isAuthenticated, async (req, res) => {
  try {
    const baseURL = req.get('host');
    const url = `${req.protocol}://${baseURL}/buscar?codigo=${req.params.codigo}`;
    const qrImage = await QRCode.toDataURL(url);
    res.json({ qr: qrImage, url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Buscar por código (vista HTML - pública)
app.get('/buscar', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'buscar.html'));
});

// Servir la página de login
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Redirigir a login si no está autenticado
app.get('/', (req, res) => {
  if (req.session.user) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }
});

app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
  console.log(`👤 Usuario admin: admin / admin123`);
  console.log(`👤 Usuario viewer: viewer / viewer123`);
});