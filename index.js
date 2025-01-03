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
// Schema for Client
const ClientSchema = new mongoose.Schema({
  name: { type: String, required: true },
});

const ItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
});

const BranchSchema = new mongoose.Schema({
  name: { type: String, required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
});

const DeliveryChallanSchema = new mongoose.Schema({
  challanId: { type: String, required: true, unique: true },
  date: { type: Date, required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  clientName: { type: String, required: true }, // Add this
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  branchName: { type: String, required: true }, // Add this
});

const BillingItemSchema = new mongoose.Schema({
  challanId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryChallan', required: true },
  particular: { type: String, required: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
  remarks: { type: String },
});

const DeliveryChallan = mongoose.model('DeliveryChallan', DeliveryChallanSchema);
const BillingItem = mongoose.model('BillingItem', BillingItemSchema);
const Client = mongoose.model('Client', ClientSchema);
const Branch = mongoose.model('Branch', BranchSchema);

const User = mongoose.model('User', UserSchema);
const Data = mongoose.model('Data', DataSchema);
const Item = mongoose.model('Item', ItemSchema);


app.get('/branches/:clientId', async (req, res) => {
  const branches = await Branch.find({ clientId: req.params.clientId });
  res.json(branches);
});

// Get client by ID
app.get('/clients/:clientId', async (req, res) => {
  const { clientId } = req.params;
  try {
      const client = await Client.findById(clientId);
      res.json(client);
  } catch (error) {
      res.status(500).json({ message: "Error fetching client", error });
  }
});

// Get branch by ID
app.get('/branchesById/:branchId', async (req, res) => {
  const { branchId } = req.params;
  try {
      console.log(branchId);
      const branch = await Branch.findById(branchId);
      res.json(branch);
  } catch (error) {
      res.status(500).json({ message: "Error fetching branch", error });
  }
});

// Get all challans
app.get('/challans', async (req, res) => {
  try {
      const challans = await DeliveryChallan.find();
      res.json(challans);
  } catch (error) {
      res.status(500).json({ message: "Error fetching challans", error });
  }
});

// Get billing items for a particular challan
app.get('/billing-items/:challanId', async (req, res) => {
  const { challanId } = req.params;
  try {
      const billingItems = await BillingItem.find({ challanId });
      res.json(billingItems);
  } catch (error) {
      res.status(500).json({ message: "Error fetching billing items", error });
  }
});

app.post('/delivery-challan', async (req, res) => {
  const { date, clientId, branchId, items } = req.body;

  try {
    // Fetch client and branch details
    const client = await Client.findById(clientId);
    const branch = await Branch.findById(branchId);

    if (!client || !branch) {
      return res.status(404).json({ success: false, message: 'Client or Branch not found' });
    }

    const challan = new DeliveryChallan({
      challanId: new mongoose.Types.ObjectId().toString(),
      date,
      clientId,
      clientName: client.name, // Store client name
      branchId,
      branchName: branch.name, // Store branch name
    });

    await challan.save();

    const itemDocs = items.map(item => ({
      challanId: challan.challanId, 
      ...item,
    }));

    await BillingItem.insertMany(itemDocs);

    res.json({ success: true, challanId: challan.challanId });
  } catch (error) {
    console.error('Error creating challan:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


app.post('/clients', async (req, res) => {
  const { name } = req.body;

  try {
      const client = new Client({ name });
      await client.save();
      res.status(201).json(client);
  } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to add client' });
  }
});

// Get Clients
app.get('/clients', async (req, res) => {
  const clients = await Client.find();
  res.json(clients);
});

// Get Items
app.get('/items', async (req, res) => {
  const items = await Item.find();
  res.json(items);
});

// Add Branches
app.post('/branches', async (req, res) => {
  const { clientId, branches } = req.body;

  if (!clientId || !branches || !Array.isArray(branches)) {
      return res.status(400).json({ error: 'Invalid data' });
  }

  try {
      const branchDocs = branches.map(branchName => ({ name: branchName, clientId }));
      await Branch.insertMany(branchDocs);
      res.status(201).json({ message: 'Branches added successfully' });
  } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to add branches' });
  }
});


app.post('/items', async (req, res) => {
  const { name } = req.body;

  if (!name) {
      return res.status(400).json({ error: 'Item name is required' });
  }

  try {
      const item = new Item({ name });
      await item.save();
      res.status(201).json(item);
  } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to add item' });
  }
});

// Route to serve Admin page
app.get('/admin', isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Route to add a new client
app.post('/add-client', isAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    const newClient = new Client({ name });
    await newClient.save();
    res.status(200).json({ success: true, message: 'Client added successfully' });
  } catch (error) {
    console.error('Error adding client:', error);
    res.status(500).json({ success: false, message: 'Failed to add client' });
  }
});

// Route to fetch clients
app.get('/clients', isLoggedIn, async (req, res) => {
  try {
    const clients = await Client.find({}, 'name');
    res.status(200).json({ success: true, clients });
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch clients' });
  }
});

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

app.get('/addChallan', isLoggedIn, async (req, res) => {
  res.sendFile(__dirname + '/public/addChallan.html');
});


app.get('/viewChallan', async (req, res) => {
  res.sendFile(__dirname + '/public/viewChallan.html');
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

app.get('/generate-challan-pdf/:challanId', async (req, res) => {
  try {
    const { challanId } = req.params;

    // Fetch challan details
    const challan = await DeliveryChallan.findOne({ challanId });
    if (!challan) {
      return res.status(404).json({ success: false, message: 'Challan not found' });
    }

    // Fetch associated billing items
    const billingItems = await BillingItem.find({ challanId: challan.challanId });
    if (!billingItems || billingItems.length === 0) {
      return res.status(404).json({ success: false, message: 'No billing items found for this challan' });
    }

    // Generate PDF
    const doc = new pdf();
    const filePath = path.join(__dirname, `Challan_${challanId}.pdf`);
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

    // Challan and Client Details
    doc
      .fontSize(12)
      .fillColor('black')
      .font('Helvetica-Bold')
      .text(`Challan ID: ${challan.challanId}`, { align: 'left' })
      .text(`Date: ${new Date(challan.date).toLocaleDateString()}`, { align: 'right' })
      .moveDown()
      .text(`M/s: ${challan.clientName}`, { align: 'left' })
      .text(`Branch: ${challan.branchName}`, { align: 'left' });
    doc.moveDown();

    // Table Header
    const tableTop = doc.y + 10;
    const startX = 50;
    const columnWidths = [50, 250, 100, 100]; // Columns: Qty, Particular, Price, Remarks
    const rowHeight = 20;

    // Draw table header with borders
    doc
      .fontSize(12)
      .fillColor('black')
      .font('Helvetica-Bold')
      .text('Qty', startX, tableTop + 5, { width: columnWidths[0], align: 'center' })
      .text('Particular', startX + columnWidths[0], tableTop + 5, { width: columnWidths[1], align: 'center' })
      .text('Price', startX + columnWidths[0] + columnWidths[1], tableTop + 5, { width: columnWidths[2], align: 'center' })
      .text('Remarks', startX + columnWidths[0] + columnWidths[1] + columnWidths[2], tableTop + 5, { width: columnWidths[3], align: 'center' });

    doc
      .rect(startX, tableTop, columnWidths.reduce((a, b) => a + b, 0), rowHeight)
      .stroke();

    // Table Rows
    let currentY = tableTop + rowHeight;
    billingItems.forEach((item) => {
      doc
        .fontSize(12)
        .fillColor('black')
        .font('Helvetica')
        .text(item.quantity.toString(), startX, currentY + 5, { width: columnWidths[0], align: 'center' })
        .text(item.particular, startX + columnWidths[0], currentY + 5, { width: columnWidths[1], align: 'left' })
        .text(item.price.toFixed(2), startX + columnWidths[0] + columnWidths[1], currentY + 5, { width: columnWidths[2], align: 'right' })
        .text(item.remarks || '', startX + columnWidths[0] + columnWidths[1] + columnWidths[2], currentY + 5, { width: columnWidths[3], align: 'left' });

      // Draw borders for each row
      doc
        .rect(startX, currentY, columnWidths.reduce((a, b) => a + b, 0), rowHeight)
        .stroke();

      currentY += rowHeight;
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

    // Send PDF as response
    writeStream.on('finish', () => {
      res.download(filePath, `Challan_${challanId}.pdf`, (err) => {
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