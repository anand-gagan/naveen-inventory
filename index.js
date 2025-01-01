// app.js - Main Application File

const bcrypt = require('bcrypt');
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const pdf = require('pdfkit');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(
  session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true,
  })
);

// MongoDB Connection
mongoose
  .connect('mongodb+srv://gagan:gagan@naveeninventorycluster.msfa6.mongodb.net/?retryWrites=true&w=majority&appName=NaveenInventoryCluster', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));


// Schemas and Models
const UserSchema = new mongoose.Schema({
  username: String,
  password: String,
  role: String, // 'admin' or 'user'
});
const DataSchema = new mongoose.Schema({
  client: String,
  serialNo: String,
  quantity: Number,
  date: Date,
  particular: String,
  rate: Number,
  createdBy: String,
});

const User = mongoose.model('User', UserSchema);
const Data = mongoose.model('Data', DataSchema);

// Middleware to check if user is logged in
function isLoggedIn(req, res, next) {
  if (req.session.user) {
    return next();
  }
  res.redirect('/login');
}

// Middleware to check if user is admin
function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  res.status(403).send('Access denied');
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.get('/login', (req, res) => {
  res.sendFile(__dirname + '/public/login.html');
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (user && (await bcrypt.compare(password, user.password))) {
    req.session.user = { username: user.username, role: user.role };
    res.redirect('/dashboard');
  } else {
    res.status(401).send('Invalid credentials');
  }
});

app.get('/register', (req, res) => {
  res.sendFile(__dirname + '/public/register.html');
});

app.post('/register', async (req, res) => {
  const { username, password, role } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = new User({ username, password: hashedPassword, role });
  await newUser.save();
  res.redirect('/login');
});

// Serve dashboard.html
app.get('/dashboard', isLoggedIn, async (req, res) => {
  res.sendFile(__dirname + '/public/dashboard.html');
});

app.get('/dashboard-data', isLoggedIn, async (req, res) => {
  try {
    const data = await Data.find();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch data' });
  }
});

app.post('/data', isLoggedIn, async (req, res) => {
  const { client, serialNo, quantity, date, particular, rate } = req.body;
  const newData = new Data({
    client,
    serialNo,
    quantity,
    date,
    particular,
    rate,
    createdBy: req.session.user.username,
  });
  await newData.save();
  res.redirect('/dashboard');
});

app.delete('/data/:id', isAdmin, async (req, res) => {
  const { id } = req.params;
  await Data.findByIdAndDelete(id);
  res.send('Data deleted');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// PDF Generation Route
app.get('/generate-pdf-old/:id', isLoggedIn, async (req, res) => {
  const { id } = req.params;
  const data = await Data.findById(id);

  if (!data) {
    return res.status(404).send('Data not found');
  }

  const doc = new pdf();
  const filePath = `./public/challan_${id}.pdf`;
  const stream = fs.createWriteStream(filePath);

  doc.pipe(stream);

  // PDF Content
  doc.fontSize(20).text('Delivery Challan', { align: 'center' });
  doc.moveDown();

  doc.fontSize(12).text(`Client: ${data.client}`);
  doc.text(`Serial No: ${data.serialNo}`);
  doc.text(`Quantity: ${data.quantity}`);
  doc.text(`Date: ${new Date(data.date).toLocaleDateString()}`);
  doc.text(`Particular: ${data.particular}`);
  doc.text(`Rate: ${data.rate}`);
  doc.text(`Created By: ${data.createdBy}`);
  doc.moveDown();

  doc.text('Authorized Signature', { align: 'right' });

  doc.end();

  stream.on('finish', () => {
    res.download(filePath, `challan_${id}.pdf`, (err) => {
      if (err) {
        console.error('Error during file download:', err);
      }
      fs.unlinkSync(filePath); // Delete the file after download
    });
  });
});

app.post('/generate-pdf', async (req, res) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'No items selected' });
    }

    const data = await Data.find({ _id: { $in: items } });
    if (!data || data.length === 0) {
      return res.status(404).json({ success: false, message: 'No data found for the selected items' });
    }

    const doc = new pdf();
    const filePath = path.join(__dirname, `challan_selected_items.pdf`);
    const writeStream = fs.createWriteStream(filePath);

    doc.pipe(writeStream);

    // Header Section
    doc
      .fontSize(22)
      .fillColor('red')
      .font('Helvetica-Bold')
      .text('Orchid Computing India', { align: 'center' });
    doc
      .fontSize(10)
      .fillColor('black')
      .font('Helvetica')
      .text('151, Bannu Enclave, Road No. 42, Pitampura, Delhi-34', { align: 'center' });
    doc.text('Phone: 27020450, 9311135345', { align: 'center' });
    doc.moveDown();

    // Delivery Challan Title
    doc
      .fontSize(16)
      .fillColor('black')
      .font('Helvetica-Bold')
      .text('Delivery Challan', { align: 'center', underline: true });
    doc.moveDown();

    // Extract Client Name
    const clientName = data[0]?.client || 'Unknown Client'; // Extract from the first row or fallback to 'Unknown Client'
    doc
      .fontSize(12)
      .fillColor('black')
      .font('Helvetica-Bold')
      .text(`M/s: ${clientName}`, { align: 'left' });
    doc.moveDown();

    // Date Section
    doc
      .fontSize(12)
      .fillColor('black')
      .font('Helvetica')
      .text(`Date: ${new Date().toLocaleDateString()}`, { align: 'right' });
    doc.moveDown();

    // Table Header
    const tableTop = doc.y + 10;
    const startX = 50;
    const columnWidths = [50, 300, 100]; // Column widths for Qty, Particular, and Rate

    doc
      .fontSize(12)
      .fillColor('black')
      .font('Helvetica-Bold')
      .text('Qty', startX, tableTop, { width: columnWidths[0], align: 'center' })
      .text('Particular', startX + columnWidths[0], tableTop, { width: columnWidths[1], align: 'center' })
      .text('Rate', startX + columnWidths[0] + columnWidths[1], tableTop, { width: columnWidths[2], align: 'center' });

    doc.moveTo(startX, doc.y + 5).lineTo(startX + columnWidths.reduce((a, b) => a + b, 0), doc.y + 5).stroke();

    // Table Rows
    let currentY = doc.y + 10;
    data.forEach((item) => {
      doc
        .fontSize(12)
        .fillColor('black')
        .font('Helvetica')
        .text(item.quantity.toString(), startX, currentY, { width: columnWidths[0], align: 'center' })
        .text(item.particular, startX + columnWidths[0], currentY, { width: columnWidths[1], align: 'left' })
        .text(item.rate.toFixed(2), startX + columnWidths[0] + columnWidths[1], currentY, { width: columnWidths[2], align: 'right' });

      currentY = doc.y + 5;
      doc
        .moveTo(startX, currentY)
        .lineTo(startX + columnWidths.reduce((a, b) => a + b, 0), currentY)
        .stroke();
      currentY += 10;
    });

    // Footer Section
    doc.moveDown();
    doc
      .fontSize(10)
      .fillColor('black')
      .font('Helvetica')
      .text('Customer Signature', startX, currentY + 20, { align: 'left' })
      .text('For Orchid Computing India', startX + 400, currentY + 20, { align: 'right' });

    doc.end();

    writeStream.on('finish', () => {
      res.download(filePath, `Challan_Selected_Items.pdf`, (err) => {
        if (err) {
          console.error('Error sending file:', err);
        }
        fs.unlinkSync(filePath); // Clean up the file after download
      });
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ success: false, message: 'Failed to generate PDF' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});