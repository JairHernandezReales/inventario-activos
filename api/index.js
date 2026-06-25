const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const QRCode = require('qrcode');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const app = express();

// Configuración de PostgreSQL (Supabase)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// Configuración de sesión para Vercel
app.use(session({
  secret: process.env.SESSION_SECRET || 'tu_clave_secreta_muy_segura',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  }
}));

// ============ CONFIGURACIÓN DE MULTER PARA IMÁGENES ============
// En Vercel, las imágenes se guardan en /tmp (temporal)
const uploadDir = '/tmp/uploads';
const equipoDir = '/tmp/uploads/equipo';
const serialDir = '/tmp/uploads/serial';

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(equipoDir)) fs.mkdirSync(equipoDir, { recursive: true });
if (!fs.existsSync(serialDir)) fs.mkdirSync(serialDir, { recursive: true });

// Configurar almacenamiento de multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (file.fieldname === 'imagen_equipo') {
      cb(null, equipoDir);
    } else if (file.fieldname === 'imagen_serial') {
      cb(null, serialDir);
    } else {
      cb(null, uploadDir);
    }
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + uuidv4();
    const extension = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + extension);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten imágenes'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: fileFilter
});

// Servir archivos estáticos desde /tmp/uploads
app.use('/uploads', express.static('/tmp/uploads'));

// ============ INICIALIZAR BASE DE DATOS ============
async function inicializarDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        nombre TEXT NOT NULL,
        email TEXT,
        rol TEXT NOT NULL DEFAULT 'viewer',
        activo INTEGER DEFAULT 1,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS empresas (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        nit TEXT,
        direccion TEXT,
        telefono TEXT,
        email TEXT,
        prefijo TEXT,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS categorias (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL UNIQUE,
        descripcion TEXT,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS activos (
        id SERIAL PRIMARY KEY,
        codigo TEXT UNIQUE NOT NULL,
        nombre TEXT NOT NULL,
        descripcion TEXT,
        categoria_id INTEGER REFERENCES categorias(id),
        empresa_id INTEGER REFERENCES empresas(id),
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
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS contador_codigos (
        empresa_id INTEGER PRIMARY KEY REFERENCES empresas(id),
        ultimo_numero INTEGER DEFAULT 0
      )
    `);

    // Insertar categorías por defecto
    await pool.query(`
      INSERT INTO categorias (nombre, descripcion) 
      VALUES 
        ('Computadoras', 'Equipos de cómputo y periféricos'),
        ('Maquinaria', 'Maquinaria y equipos industriales'),
        ('Herramientas', 'Herramientas y equipos manuales'),
        ('Electrónicos', 'Equipos electrónicos y de comunicación')
      ON CONFLICT (nombre) DO NOTHING
    `);

    // Insertar usuario admin por defecto
    const adminPassword = bcrypt.hashSync('JotaDev16', 10);
    await pool.query(`
      INSERT INTO usuarios (username, password, nombre, email, rol) 
      VALUES ('admin', $1, 'Administrador', 'dfxyair@gmail.com', 'admin')
      ON CONFLICT (username) DO NOTHING
    `, [adminPassword]);

    console.log('✅ Base de datos inicializada correctamente');
  } catch (error) {
    console.error('❌ Error inicializando DB:', error);
  }
}

inicializarDB();

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

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE username = $1 AND activo = 1',
      [username]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }
    
    const user = result.rows[0];
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
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
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

app.get('/api/usuarios', isAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, nombre, email, rol, activo, fecha_creacion FROM usuarios'
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/usuarios', isAdmin, async (req, res) => {
  const { username, password, nombre, email, rol } = req.body;
  
  if (!username || !password || !nombre) {
    return res.status(400).json({ error: 'Usuario, contraseña y nombre son requeridos' });
  }
  
  try {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = await pool.query(
      'INSERT INTO usuarios (username, password, nombre, email, rol) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [username, hashedPassword, nombre, email || '', rol || 'viewer']
    );
    res.json({ id: result.rows[0].id });
  } catch (error) {
    if (error.constraint === 'usuarios_username_key') {
      res.status(400).json({ error: 'El nombre de usuario ya existe' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

app.put('/api/usuarios/:id', isAdmin, async (req, res) => {
  const { username, nombre, email, rol, activo, password } = req.body;
  
  try {
    let query = 'UPDATE usuarios SET username = $1, nombre = $2, email = $3, rol = $4, activo = $5';
    let params = [username, nombre, email, rol, activo];
    let paramCount = 6;
    
    if (password && password.trim() !== '') {
      query += ', password = $' + paramCount;
      params.push(bcrypt.hashSync(password, 10));
      paramCount++;
    }
    
    query += ' WHERE id = $' + paramCount;
    params.push(req.params.id);
    
    await pool.query(query, params);
    res.json({ updated: true });
  } catch (error) {
    if (error.constraint === 'usuarios_username_key') {
      res.status(400).json({ error: 'El nombre de usuario ya existe' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

app.delete('/api/usuarios/:id', isAdmin, async (req, res) => {
  if (req.params.id == req.session.user.id) {
    return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
  }
  
  try {
    await pool.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ENDPOINTS EMPRESAS ============

app.get('/api/empresas', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM empresas ORDER BY nombre');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/empresas', canWrite, async (req, res) => {
  const { nombre, nit, direccion, telefono, email, prefijo } = req.body;
  
  try {
    const result = await pool.query(
      'INSERT INTO empresas (nombre, nit, direccion, telefono, email, prefijo) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [nombre, nit, direccion, telefono, email, prefijo || nombre.substring(0, 3).toUpperCase()]
    );
    
    const empresaId = result.rows[0].id;
    await pool.query(
      'INSERT INTO contador_codigos (empresa_id, ultimo_numero) VALUES ($1, 0)',
      [empresaId]
    );
    
    res.json({ id: empresaId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/empresas/:id', canWrite, async (req, res) => {
  const { nombre, nit, direccion, telefono, email, prefijo } = req.body;
  
  try {
    await pool.query(
      'UPDATE empresas SET nombre = $1, nit = $2, direccion = $3, telefono = $4, email = $5, prefijo = $6 WHERE id = $7',
      [nombre, nit, direccion, telefono, email, prefijo, req.params.id]
    );
    res.json({ updated: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/empresas/:id', isAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM activos WHERE empresa_id = $1', [req.params.id]);
    if (parseInt(result.rows[0].count) > 0) {
      return res.status(400).json({ error: 'No se puede eliminar: la empresa tiene activos asociados' });
    }
    
    await pool.query('DELETE FROM empresas WHERE id = $1', [req.params.id]);
    await pool.query('DELETE FROM contador_codigos WHERE empresa_id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ENDPOINTS CATEGORÍAS ============

app.get('/api/categorias', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categorias ORDER BY nombre');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/categorias', canWrite, async (req, res) => {
  const { nombre, descripcion } = req.body;
  
  try {
    const result = await pool.query(
      'INSERT INTO categorias (nombre, descripcion) VALUES ($1, $2) RETURNING id',
      [nombre, descripcion || '']
    );
    res.json({ id: result.rows[0].id });
  } catch (error) {
    if (error.constraint === 'categorias_nombre_key') {
      res.status(400).json({ error: 'Esta categoría ya existe' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

app.put('/api/categorias/:id', canWrite, async (req, res) => {
  const { nombre, descripcion } = req.body;
  
  try {
    await pool.query(
      'UPDATE categorias SET nombre = $1, descripcion = $2 WHERE id = $3',
      [nombre, descripcion, req.params.id]
    );
    res.json({ updated: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/categorias/:id', isAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM activos WHERE categoria_id = $1', [req.params.id]);
    if (parseInt(result.rows[0].count) > 0) {
      return res.status(400).json({ error: 'No se puede eliminar: la categoría tiene activos asociados' });
    }
    
    await pool.query('DELETE FROM categorias WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ENDPOINTS ACTIVOS ============

app.post('/api/generar-codigo', isAuthenticated, async (req, res) => {
  const { empresa_id } = req.body;
  
  try {
    const empresaResult = await pool.query('SELECT prefijo FROM empresas WHERE id = $1', [empresa_id]);
    if (empresaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }
    
    const prefijo = empresaResult.rows[0].prefijo || 'ACT';
    const año = new Date().getFullYear();
    
    await pool.query(
      'UPDATE contador_codigos SET ultimo_numero = ultimo_numero + 1 WHERE empresa_id = $1',
      [empresa_id]
    );
    
    const contadorResult = await pool.query(
      'SELECT ultimo_numero FROM contador_codigos WHERE empresa_id = $1',
      [empresa_id]
    );
    
    const numero = String(contadorResult.rows[0].ultimo_numero).padStart(4, '0');
    const codigo = `${prefijo}-${año}-${numero}`;
    res.json({ codigo });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/activos', isAuthenticated, async (req, res) => {
  try {
    const query = `
      SELECT a.*, e.nombre as empresa_nombre, e.prefijo,
             c.nombre as categoria_nombre
      FROM activos a
      LEFT JOIN empresas e ON a.empresa_id = e.id
      LEFT JOIN categorias c ON a.categoria_id = c.id
      ORDER BY a.id DESC
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/activos/:codigo', isAuthenticated, async (req, res) => {
  try {
    const query = `
      SELECT a.*, e.nombre as empresa_nombre, e.prefijo,
             c.nombre as categoria_nombre
      FROM activos a
      LEFT JOIN empresas e ON a.empresa_id = e.id
      LEFT JOIN categorias c ON a.categoria_id = c.id
      WHERE a.codigo = $1
    `;
    const result = await pool.query(query, [req.params.codigo]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Activo no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/activos', canWrite, upload.fields([
  { name: 'imagen_equipo', maxCount: 1 },
  { name: 'imagen_serial', maxCount: 1 }
]), async (req, res) => {
  const {
    codigo, nombre, descripcion, categoria_id, empresa_id,
    fecha_adquisicion, valor_compra, valor_actual,
    estado, ubicacion, proveedor, garantia, numero_serie,
    responsable_nombre, responsable_cedula, responsable_cargo,
    responsable_telefono, responsable_email, fecha_asignacion
  } = req.body;

  const imagen_equipo = req.files && req.files['imagen_equipo'] ? 
    '/uploads/equipo/' + req.files['imagen_equipo'][0].filename : null;
  const imagen_serial = req.files && req.files['imagen_serial'] ? 
    '/uploads/serial/' + req.files['imagen_serial'][0].filename : null;

  try {
    const result = await pool.query(
      `INSERT INTO activos (
        codigo, nombre, descripcion, categoria_id, empresa_id,
        fecha_adquisicion, valor_compra, valor_actual,
        estado, ubicacion, proveedor, garantia, numero_serie,
        responsable_nombre, responsable_cedula, responsable_cargo,
        responsable_telefono, responsable_email, fecha_asignacion,
        imagen_equipo, imagen_serial
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21) RETURNING id`,
      [
        codigo, nombre, descripcion, categoria_id, empresa_id,
        fecha_adquisicion, valor_compra, valor_actual || valor_compra,
        estado, ubicacion, proveedor, garantia, numero_serie,
        responsable_nombre, responsable_cedula, responsable_cargo,
        responsable_telefono, responsable_email, fecha_asignacion,
        imagen_equipo, imagen_serial
      ]
    );
    res.json({ id: result.rows[0].id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/activos/:id', canWrite, upload.fields([
  { name: 'imagen_equipo', maxCount: 1 },
  { name: 'imagen_serial', maxCount: 1 }
]), async (req, res) => {
  const {
    codigo, nombre, descripcion, categoria_id, empresa_id,
    fecha_adquisicion, valor_compra, valor_actual,
    estado, ubicacion, proveedor, garantia, numero_serie,
    responsable_nombre, responsable_cedula, responsable_cargo,
    responsable_telefono, responsable_email, fecha_asignacion,
    imagen_equipo_actual, imagen_serial_actual
  } = req.body;

  let imagen_equipo = imagen_equipo_actual || null;
  let imagen_serial = imagen_serial_actual || null;

  if (req.files && req.files['imagen_equipo']) {
    imagen_equipo = '/uploads/equipo/' + req.files['imagen_equipo'][0].filename;
  }

  if (req.files && req.files['imagen_serial']) {
    imagen_serial = '/uploads/serial/' + req.files['imagen_serial'][0].filename;
  }

  try {
    await pool.query(
      `UPDATE activos SET
        codigo = $1, nombre = $2, descripcion = $3, categoria_id = $4,
        empresa_id = $5, fecha_adquisicion = $6, valor_compra = $7,
        valor_actual = $8, estado = $9, ubicacion = $10,
        proveedor = $11, garantia = $12, numero_serie = $13,
        responsable_nombre = $14, responsable_cedula = $15,
        responsable_cargo = $16, responsable_telefono = $17,
        responsable_email = $18, fecha_asignacion = $19,
        imagen_equipo = $20, imagen_serial = $21
      WHERE id = $22`,
      [
        codigo, nombre, descripcion, categoria_id, empresa_id,
        fecha_adquisicion, valor_compra, valor_actual,
        estado, ubicacion, proveedor, garantia, numero_serie,
        responsable_nombre, responsable_cedula, responsable_cargo,
        responsable_telefono, responsable_email, fecha_asignacion,
        imagen_equipo, imagen_serial,
        req.params.id
      ]
    );
    res.json({ updated: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/activos/:id', isAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM activos WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ QR ============
app.get('/api/qr/:codigo', isAuthenticated, async (req, res) => {
  try {
    const baseURL = req.get('host');
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const url = `${protocol}://${baseURL}/buscar?codigo=${req.params.codigo}`;
    const qrImage = await QRCode.toDataURL(url);
    res.json({ qr: qrImage, url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Servir archivos estáticos
app.get('/buscar', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'buscar.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'login.html'));
});

app.get('/', (req, res) => {
  if (req.session.user) {
    res.sendFile(path.join(__dirname, '../public', 'index.html'));
  } else {
    res.sendFile(path.join(__dirname, '../public', 'login.html'));
  }
});

// ============ EXPORTAR PARA VERCEL ============
module.exports = app;