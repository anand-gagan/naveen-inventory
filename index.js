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
  billingCode: String, // New field
  lastChallanNumber: { type: Number, default: 10000 },
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
  clientName: { type: String, required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  branchName: { type: String, required: true },
});

const BillingItemSchema = new mongoose.Schema({
  challanId: { type: String, ref: 'DeliveryChallan', required: true },
  particular: { type: String, required: true },
  quantity: { type: Number, required: true },
  price: { type: String, required: true },
  remarks: { type: String },
});

const DeliveryChallan = mongoose.model('DeliveryChallan', DeliveryChallanSchema);
const BillingItem = mongoose.model('BillingItem', BillingItemSchema);
const Client = mongoose.model('Client', ClientSchema);
const Branch = mongoose.model('Branch', BranchSchema);

const User = mongoose.model('User', UserSchema);
const Item = mongoose.model('Item', ItemSchema);


app.get('/branches/:clientId', async (req, res) => {
  const branches = await Branch.find({ clientId: req.params.clientId }).sort({ name: 1 });;
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

app.get('/challans', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = req.session.user;

    let challans;
    if (user.role === 'admin') {
      challans = await DeliveryChallan.find().sort({ challanId: -1 });
    } else {
      const billingCode = user.billingCode;
      challans = await DeliveryChallan.find({ challanId: { $regex: `^${billingCode}` } }).sort({ date: -1 });
    }

    res.json(challans);
  } catch (error) {
    res.status(500).json({ message: "Error fetching challans", error });
  }
});

// Get billing items for a particular challan
app.get('/billing-items/:challanId', async (req, res) => {
  const { challanId } = req.params;
  try {
      const billingItems = await BillingItem.find({ challanId }).sort({ particular: 1 });;
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
      challanId: await generateChallanId(req.session.user.username),
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
  const clients = await Client.find().sort({ name: 1 });
  res.json(clients);
});

// Get Items
app.get('/items', async (req, res) => {
  const items = await Item.find().sort({ name: 1 });
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
    const clients = await Client.find({}, 'name').sort({ name: 1 });
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
app.get('/', isLoggedIn, (req, res) => {
  res.sendFile(__dirname + '/public/home.html');
});

app.get('/login', (req, res) => {
  res.sendFile(__dirname + '/public/login.html');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.post('/change-password', isLoggedIn, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  try {
    const user = await User.findOne({ username: req.session.user.username });
    console.log('found user', user);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check if current password matches
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    console.log('found user', isMatch);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }


    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the user's password
    user.password = hashedPassword;
    await user.save();

    res.status(200).json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ success: false, message: 'Failed to change password' });
  }
});

app.post('/set-password',  isAdmin, async (req, res) => {
  const { userId, newPassword } = req.body;

  if (!userId || !newPassword) {
    return res.status(400).send('User ID and new password are required');
  }

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(userId, { password: hashedPassword });
    res.status(200).send('Password updated successfully');
  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).send('Failed to update password');
  }
});

app.get('/users',  isAdmin, async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).send('Failed to fetch users');
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (user && (await bcrypt.compare(password, user.password))) {
    req.session.user = { username: user.username, role: user.role, billingCode: user.billingCode };
    res.redirect('/home');
  } else {
    res.status(401).send('Invalid credentials');
  }
});

app.get('/register', (req, res) => {
  res.sendFile(__dirname + '/public/register.html');
});

app.post('/register', isAdmin, async (req, res) => {
  const { username, password, role, billingCode } = req.body; // Extract billingCode
  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = new User({ username, password: hashedPassword, role, billingCode });
  await newUser.save();
  res.redirect('/home');
});

// Serve dashboard.html
app.get('/home', isLoggedIn, async (req, res) => {
  res.sendFile(__dirname + '/public/home.html');
});

app.get('/addChallan', isLoggedIn, async (req, res) => {
  res.sendFile(__dirname + '/public/addChallan.html');
});

app.get('/viewChallan', async (req, res) => {
  res.sendFile(__dirname + '/public/viewChallan.html');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.get('/generate-challan-pdf/:challanId', async (req, res) => {
  try {
    const { challanId } = req.params;

    // Fetch challan details
    const challan = await DeliveryChallan.findOne({ challanId });
    if (!challan) {
      return res.status(404).json({ success: false, message: 'Challan not found' });
    }

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
      .text(`Date: ${formatDate(challan.date)}`, { align: 'right' })
      .moveDown()
      .text(`M/s: ${challan.clientName}`, { align: 'left' })
      .text(`Branch: ${challan.branchName}`, { align: 'left' });
    doc.moveDown();

    // Table Header
    const tableTop = doc.y + 10;
    const startX = 50;
    const columnWidths = [50, 200, 100, 200]; // Adjusted column widths
    const baseRowHeight = 20;
    const cellPadding = 5; // Padding inside cells

    // Draw table header
    doc
      .fontSize(12)
      .fillColor('black')
      .font('Helvetica-Bold')
      .text('Qty', startX + cellPadding, tableTop + cellPadding, { width: columnWidths[0] - 2 * cellPadding, align: 'center' })
      .text('Particular', startX + columnWidths[0] + cellPadding, tableTop + cellPadding, { width: columnWidths[1] - 2 * cellPadding, align: 'center' })
      .text('Price', startX + columnWidths[0] + columnWidths[1] + cellPadding, tableTop + cellPadding, { width: columnWidths[2] - 2 * cellPadding, align: 'center' })
      .text('Remarks', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + cellPadding, tableTop + cellPadding, { width: columnWidths[3] - 2 * cellPadding, align: 'center' });

    doc
      .rect(startX, tableTop, columnWidths.reduce((a, b) => a + b, 0), baseRowHeight)
      .stroke();

    // Add vertical separators for header
    columnWidths.reduce((x, width) => {
      doc
        .moveTo(startX + x, tableTop)
        .lineTo(startX + x, tableTop + baseRowHeight)
        .stroke();
      return x + width;
    }, 0);

    // Table Rows
    let currentY = tableTop + baseRowHeight;

    billingItems.forEach((item) => {
      // Calculate dynamic row height
      const qtyHeight = doc.heightOfString(item.quantity.toString(), { width: columnWidths[0] - 2 * cellPadding });
      const particularHeight = doc.heightOfString(item.particular, { width: columnWidths[1] - 2 * cellPadding });
      const priceHeight = doc.heightOfString(item.price, { width: columnWidths[2] - 2 * cellPadding });
      const remarksHeight = doc.heightOfString(item.remarks || '', { width: columnWidths[3] - 2 * cellPadding });

      const rowHeight = Math.max(qtyHeight, particularHeight, priceHeight, remarksHeight, baseRowHeight);

      // Render row content with padding
      doc
        .fontSize(12)
        .fillColor('black')
        .font('Helvetica')
        .text(item.quantity.toString(), startX + cellPadding, currentY + cellPadding, { width: columnWidths[0] - 2 * cellPadding, align: 'center' })
        .text(item.particular, startX + columnWidths[0] + cellPadding, currentY + cellPadding, { width: columnWidths[1] - 2 * cellPadding, align: 'center' })
        .text(item.price, startX + columnWidths[0] + columnWidths[1] + cellPadding, currentY + cellPadding, { width: columnWidths[2] - 2 * cellPadding, align: 'center' })
        .text(item.remarks || '', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + cellPadding, currentY + cellPadding, { width: columnWidths[3] - 2 * cellPadding, align: 'center' });

      // Draw borders for the row
      doc
        .rect(startX, currentY, columnWidths.reduce((a, b) => a + b, 0), rowHeight)
        .stroke();

      // Add vertical separators for the row
      columnWidths.reduce((x, width) => {
        doc
          .moveTo(startX + x, currentY)
          .lineTo(startX + x, currentY + rowHeight)
          .stroke();
        return x + width;
      }, 0);

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

const generateChallanId = async (username) => {

  const user = await User.findOne({ username });
  if (!user) {
    throw new Error('User not found');
  }
  user.lastChallanNumber += 1;
  const challanId = `${user.billingCode}${user.lastChallanNumber}`;
  await user.save();

  return challanId;
};

// Helper function to format the date
function formatDate(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

app.use((req, res) => {
  res.redirect('/home'); // Redirect to the home page
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is up and running on http://localhost:${PORT} or server`);
});