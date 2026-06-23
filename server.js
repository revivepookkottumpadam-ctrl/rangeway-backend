const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET || 'rangeway_jwt_secret_token_change_in_production';
const MOCK_DB_PATH = path.join(__dirname, 'mock_db.json');

app.use(cors());
app.use(express.json());

const bcrypt = require('bcryptjs');

// Hash passwords on startup to prevent storing plaintext passwords in memory or source files
const ADVISOR1_HASH = bcrypt.hashSync(process.env.ADVISOR1_PASSWORD || 'range123', 10);
const ADVISOR2_HASH = bcrypt.hashSync(process.env.ADVISOR2_PASSWORD || 'range456', 10);
const ADMIN_HASH = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin789', 10);

// Predefined Users
const PREDEFINED_USERS = [
  { id: 'advisor1@rangeway.com', hash: ADVISOR1_HASH, name: 'Service Advisor 1', role: 'advisor' },
  { id: 'advisor2@rangeway.com', hash: ADVISOR2_HASH, name: 'Service Advisor 2', role: 'advisor' },
  { id: 'admin@rangeway.com', hash: ADMIN_HASH, name: 'System Administrator', role: 'admin' }
];

// Initialize Mock database file if it doesn't exist
if (!fs.existsSync(MOCK_DB_PATH)) {
  fs.writeFileSync(MOCK_DB_PATH, JSON.stringify([], null, 2));
}

// Database Connection
let pool = null;
let useMockDb = true;

if (process.env.DATABASE_URL) {
  try {
    const isLocalhost = process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: isLocalhost ? false : { rejectUnauthorized: false }
    });
    console.log(`PostgreSQL Pool initialized (SSL ${isLocalhost ? 'disabled for localhost' : 'enabled'}).`);
    
    // Test database connection
    pool.query('SELECT NOW()', (err, res) => {
      if (err) {
        console.error('Database connection error! Falling back to local file mock database.', err.message);
        useMockDb = true;
      } else {
        console.log('Database connected successfully. Live PostgreSQL mode active.');
        useMockDb = false;
      }
    });
  } catch (error) {
    console.error('Error starting PostgreSQL pool. Falling back to local file mock database.', error.message);
    useMockDb = true;
  }
} else {
  console.log('DATABASE_URL not found in environment. Running in Offline Mock Database mode.');
  useMockDb = true;
}

// Helper functions for mock DB operations
const readMockDb = () => {
  try {
    const data = fs.readFileSync(MOCK_DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading mock DB', err);
    return [];
  }
};

const writeMockDb = (data) => {
  try {
    fs.writeFileSync(MOCK_DB_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error writing to mock DB', err);
  }
};

// Middleware: Authenticate Token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ message: 'Access token required' });
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

// --- ROUTES ---

// 1. Auth: Login Route
app.post('/api/auth/login', (req, res) => {
  const { id, password } = req.body;
  
  if (!id || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const user = PREDEFINED_USERS.find(
    u => u.id.toLowerCase() === id.toLowerCase()
  );

  if (!user || !bcrypt.compareSync(password, user.hash)) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: user.id, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '48h' }
  );

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      role: user.role
    }
  });
});

// 2. JobCards: Create
app.post('/api/jobcards', authenticateToken, async (req, res) => {
  const jc = req.body;
  
  // Basic validation
  if (!jc.jc_no || !jc.reg_no || !jc.model || !jc.customer_name || !jc.mobile) {
    return res.status(400).json({ message: 'Required fields missing: JC No, Reg No, Model, Customer Name, and Mobile Phone are required.' });
  }

  if (useMockDb) {
    const db = readMockDb();
    if (db.find(item => item.jc_no === jc.jc_no)) {
      return res.status(400).json({ message: `Job Card number ${jc.jc_no} already exists.` });
    }
    const newJobCard = {
      id: db.length > 0 ? Math.max(...db.map(x => x.id)) + 1 : 1,
      ...jc,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    db.push(newJobCard);
    writeMockDb(db);
    return res.status(201).json(newJobCard);
  } else {
    try {
      // Check duplicate
      const duplicate = await pool.query('SELECT id FROM job_cards WHERE jc_no = $1', [jc.jc_no]);
      if (duplicate.rows.length > 0) {
        return res.status(400).json({ message: `Job Card number ${jc.jc_no} already exists.` });
      }

      const queryText = `
        INSERT INTO job_cards (
          jc_no, reg_no, model, service_type, engine_no, date,
          customer_name, address, phone, mobile, customer_demands, action_taken,
          products, labour, estimate_service_charge, tax, total_amount, grand_total,
          advisor_name, service_advise
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        RETURNING *
      `;

      const values = [
        jc.jc_no, jc.reg_no, jc.model, jc.service_type, jc.engine_no, jc.date || new Date(),
        jc.customer_name, jc.address, jc.phone, jc.mobile, jc.customer_demands, jc.action_taken,
        JSON.stringify(jc.products || []), JSON.stringify(jc.labour || []),
        parseFloat(jc.estimate_service_charge) || 0.00, parseFloat(jc.tax) || 0.00,
        parseFloat(jc.total_amount) || 0.00, parseFloat(jc.grand_total) || 0.00,
        jc.advisor_name, jc.service_advise
      ];

      const result = await pool.query(queryText, values);
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Error inserting job card', err);
      res.status(500).json({ message: 'Server error while inserting job card', error: err.message });
    }
  }
});

// 3. JobCards: Read All
app.get('/api/jobcards', authenticateToken, async (req, res) => {
  const { search } = req.query;

  if (useMockDb) {
    let db = readMockDb();
    if (search) {
      const s = search.toLowerCase();
      db = db.filter(item => 
        (item.jc_no && item.jc_no.toLowerCase().includes(s)) ||
        (item.reg_no && item.reg_no.toLowerCase().includes(s)) ||
        (item.customer_name && item.customer_name.toLowerCase().includes(s)) ||
        (item.mobile && item.mobile.toLowerCase().includes(s))
      );
    }
    // Return newest first
    db.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return res.json(db);
  } else {
    try {
      let queryText = 'SELECT * FROM job_cards';
      const values = [];

      if (search) {
        queryText += ` WHERE 
          LOWER(jc_no) LIKE $1 OR 
          LOWER(reg_no) LIKE $1 OR 
          LOWER(customer_name) LIKE $1 OR 
          LOWER(mobile) LIKE $1`;
        values.push(`%${search.toLowerCase()}%`);
      }

      queryText += ' ORDER BY created_at DESC';

      const result = await pool.query(queryText, values);
      res.json(result.rows);
    } catch (err) {
      console.error('Error loading job cards', err);
      res.status(500).json({ message: 'Server error while fetching job cards', error: err.message });
    }
  }
});

// 4. JobCards: Read One
app.get('/api/jobcards/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  if (useMockDb) {
    const db = readMockDb();
    const item = db.find(x => x.id === parseInt(id));
    if (!item) return res.status(404).json({ message: 'Job card not found' });
    return res.json(item);
  } else {
    try {
      const result = await pool.query('SELECT * FROM job_cards WHERE id = $1', [id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Job card not found' });
      }
      res.json(result.rows[0]);
    } catch (err) {
      console.error('Error fetching job card detail', err);
      res.status(500).json({ message: 'Server error while fetching job card details', error: err.message });
    }
  }
});

// 5. JobCards: Update
app.put('/api/jobcards/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const jc = req.body;

  if (useMockDb) {
    const db = readMockDb();
    const index = db.findIndex(x => x.id === parseInt(id));
    if (index === -1) return res.status(404).json({ message: 'Job card not found' });

    // Validate duplicates if jc_no changed
    if (jc.jc_no && jc.jc_no !== db[index].jc_no) {
      if (db.find(item => item.jc_no === jc.jc_no)) {
        return res.status(400).json({ message: `Job Card number ${jc.jc_no} already exists.` });
      }
    }

    db[index] = {
      ...db[index],
      ...jc,
      updated_at: new Date().toISOString()
    };
    writeMockDb(db);
    return res.json(db[index]);
  } else {
    try {
      // Validate duplicates if jc_no changed
      const original = await pool.query('SELECT jc_no FROM job_cards WHERE id = $1', [id]);
      if (original.rows.length === 0) {
        return res.status(404).json({ message: 'Job card not found' });
      }
      
      if (jc.jc_no && jc.jc_no !== original.rows[0].jc_no) {
        const duplicate = await pool.query('SELECT id FROM job_cards WHERE jc_no = $1 AND id <> $2', [jc.jc_no, id]);
        if (duplicate.rows.length > 0) {
          return res.status(400).json({ message: `Job Card number ${jc.jc_no} already exists.` });
        }
      }

      const queryText = `
        UPDATE job_cards SET
          jc_no = $1, reg_no = $2, model = $3, service_type = $4, engine_no = $5, date = $6,
          customer_name = $7, address = $8, phone = $9, mobile = $10, customer_demands = $11, action_taken = $12,
          products = $13, labour = $14, estimate_service_charge = $15, tax = $16, total_amount = $17, grand_total = $18,
          advisor_name = $19, service_advise = $20, updated_at = NOW()
        WHERE id = $21
        RETURNING *
      `;

      const values = [
        jc.jc_no, jc.reg_no, jc.model, jc.service_type, jc.engine_no, jc.date,
        jc.customer_name, jc.address, jc.phone, jc.mobile, jc.customer_demands, jc.action_taken,
        JSON.stringify(jc.products || []), JSON.stringify(jc.labour || []),
        parseFloat(jc.estimate_service_charge) || 0.00, parseFloat(jc.tax) || 0.00,
        parseFloat(jc.total_amount) || 0.00, parseFloat(jc.grand_total) || 0.00,
        jc.advisor_name, jc.service_advise,
        id
      ];

      const result = await pool.query(queryText, values);
      res.json(result.rows[0]);
    } catch (err) {
      console.error('Error updating job card', err);
      res.status(500).json({ message: 'Server error while updating job card', error: err.message });
    }
  }
});

// 6. JobCards: Delete
app.delete('/api/jobcards/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  if (useMockDb) {
    const db = readMockDb();
    const index = db.findIndex(x => x.id === parseInt(id));
    if (index === -1) return res.status(404).json({ message: 'Job card not found' });
    
    db.splice(index, 1);
    writeMockDb(db);
    return res.json({ message: 'Job card deleted successfully' });
  } else {
    try {
      const result = await pool.query('DELETE FROM job_cards WHERE id = $1 RETURNING id', [id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Job card not found' });
      }
      res.json({ message: 'Job card deleted successfully' });
    } catch (err) {
      console.error('Error deleting job card', err);
      res.status(500).json({ message: 'Server error while deleting job card', error: err.message });
    }
  }
});

// 7. Export: Push all job cards to Google Sheets
app.post('/api/export/sheets', authenticateToken, async (req, res) => {
  const SHEET_ID = process.env.GOOGLE_SHEET_ID;
  const KEY_PATH = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH
    ? path.resolve(__dirname, process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH)
    : path.join(__dirname, 'google-service-account.json');

  if (!SHEET_ID || SHEET_ID === 'your_google_sheet_id_here') {
    return res.status(400).json({
      message: 'Google Sheet ID is not configured. Please set GOOGLE_SHEET_ID in your .env file.'
    });
  }

  if (!fs.existsSync(KEY_PATH)) {
    return res.status(400).json({
      message: `Service account key file not found at "${KEY_PATH}". Please follow the setup guide in GOOGLE_SHEETS_SETUP.md.`
    });
  }

  // Load all job cards
  let allJobCards = [];
  if (useMockDb) {
    allJobCards = readMockDb();
    allJobCards.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  } else {
    try {
      const result = await pool.query('SELECT * FROM job_cards ORDER BY created_at ASC');
      allJobCards = result.rows;
    } catch (err) {
      console.error('Error fetching job cards for export', err);
      return res.status(500).json({ message: 'Failed to fetch job cards from database.', error: err.message });
    }
  }

  // Filter for current month if requested
  const { filter } = req.body || {};
  if (filter === 'current_month') {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); // 0-11
    
    allJobCards = allJobCards.filter(jc => {
      if (!jc.date) return false;
      
      let jcYear, jcMonth;
      if (typeof jc.date === 'string') {
        const parts = jc.date.split('-'); // e.g. "2026-06-23"
        if (parts.length >= 2) {
          jcYear = parseInt(parts[0], 10);
          jcMonth = parseInt(parts[1], 10) - 1; // 0-indexed
        }
      }
      
      if (jcYear === undefined || isNaN(jcYear)) {
        const jcDate = new Date(jc.date);
        jcYear = jcDate.getFullYear();
        jcMonth = jcDate.getMonth();
      }
      
      return jcYear === currentYear && jcMonth === currentMonth;
    });
  }

  try {
    // Authenticate with Google using the service account
    const auth = new google.auth.GoogleAuth({
      keyFile: KEY_PATH,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Helper to format products array into readable text
    const formatProducts = (raw) => {
      let items = [];
      if (typeof raw === 'string') {
        try { items = JSON.parse(raw); } catch { return raw || ''; }
      } else if (Array.isArray(raw)) {
        items = raw;
      }
      if (!items.length) return '';
      return items.map((p, i) =>
        `${i + 1}. ${p.particulars || ''}${p.code ? ` (${p.code})` : ''} | Qty: ${p.qty || 0} | Rate: Rs.${parseFloat(p.rate || 0).toFixed(2)} | Amt: Rs.${parseFloat(p.amount || 0).toFixed(2)}`
      ).join('\n');
    };

    const formatLabour = (raw) => {
      let items = [];
      if (typeof raw === 'string') {
        try { items = JSON.parse(raw); } catch { return raw || ''; }
      } else if (Array.isArray(raw)) {
        items = raw;
      }
      if (!items.length) return '';
      return items.map((l, i) =>
        `${i + 1}. ${l.particulars || ''} | Qty: ${l.qty || 0} | Rate: Rs.${parseFloat(l.rate || 0).toFixed(2)} | Amt: Rs.${parseFloat(l.amount || 0).toFixed(2)}`
      ).join('\n');
    };

    // Build header row
    const headers = [
      'ID', 'JC No.', 'Date', 'Reg No.', 'Model', 'Engine No.', 'Service Type',
      'Customer Name', 'Address', 'Phone', 'Mobile',
      'Customer Demands', 'Action Taken',
      'Est. Service Charge', 'Tax', 'Total Amount', 'Grand Total',
      'Advisor Name', 'Service Advise',
      'Products', 'Labour',
      'Created At', 'Updated At'
    ];

    // Build data rows
    const dataRows = allJobCards.map(jc => [
      jc.id || '',
      jc.jc_no || '',
      jc.date ? new Date(jc.date).toLocaleDateString('en-IN') : '',
      jc.reg_no || '',
      jc.model || '',
      jc.engine_no || '',
      jc.service_type || '',
      jc.customer_name || '',
      jc.address || '',
      jc.phone || '',
      jc.mobile || '',
      jc.customer_demands || '',
      jc.action_taken || '',
      parseFloat(jc.estimate_service_charge) || 0,
      parseFloat(jc.tax) || 0,
      parseFloat(jc.total_amount) || 0,
      parseFloat(jc.grand_total) || 0,
      jc.advisor_name || '',
      jc.service_advise || '',
      formatProducts(jc.products),
      formatLabour(jc.labour),
      jc.created_at ? new Date(jc.created_at).toLocaleString('en-IN') : '',
      jc.updated_at ? new Date(jc.updated_at).toLocaleString('en-IN') : '',
    ]);

    // Clear the sheet then write data
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: 'Sheet1',
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'Sheet1!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [headers, ...dataRows],
      },
    });

    // Format header row: bold white text on orange background, freeze first row
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [
          // Style the header row with orange background and white bold text
          {
            repeatCell: {
              range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                  backgroundColor: { red: 1.0, green: 0.416, blue: 0.0 }, // #FF6A00 orange
                  horizontalAlignment: 'CENTER',
                  verticalAlignment: 'MIDDLE',
                },
              },
              fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment,verticalAlignment)',
            },
          },
          // Freeze the header row so it stays visible while scrolling
          {
            updateSheetProperties: {
              properties: {
                sheetId: 0,
                gridProperties: { frozenRowCount: 1 },
              },
              fields: 'gridProperties.frozenRowCount',
            },
          },
          // Auto-resize all columns for better readability
          {
            autoResizeDimensions: {
              dimensions: {
                sheetId: 0,
                dimension: 'COLUMNS',
                startIndex: 0,
                endIndex: headers.length,
              },
            },
          },
        ],
      },
    });

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
    res.json({
      message: `Successfully exported ${dataRows.length} job card(s) to Google Sheets.`,
      count: dataRows.length,
      sheetUrl,
    });
  } catch (err) {
    console.error('Google Sheets export error:', err);
    res.status(500).json({
      message: 'Failed to export to Google Sheets. Check your service account credentials and sheet permissions.',
      error: err.message
    });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
