require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'DUK BusTracker API is running 🚌' });
});

// TODO: Import and use route modules
// const busRoutes = require('./routes/busRoutes');
// app.use('/api/buses', busRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
