// Server setup code
const express = require('express');
const app = express();

// Middleware and routes setup
app.use(express.json());

const authRoutes = require('./routes/auth');
const itemRoutes = require('./routes/items');
const reminderRoutes = require('./routes/reminders');

app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/reminders', reminderRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});