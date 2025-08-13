const mongoose = require('mongoose');

// MongoDB connection
const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://dinhtoai1:Toai0211@cluster0.necnpeu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(mongoUri, { 
  useNewUrlParser: true, 
  useUnifiedTopology: true 
})
.then(() => console.log('✅ Đã kết nối MongoDB'))
.catch(err => console.error('❌ Lỗi kết nối MongoDB:', err));

// Counter Schema
const counterSchema = new mongoose.Schema({
  service: { type: String, required: true, unique: true },
  currentNumber: { type: Number, default: 0 },
  calledNumber: { type: Number, default: 0 }, // Số đã gọi
  lastUpdated: { type: Date, default: Date.now } // Thời gian gọi số cuối
}, { versionKey: false });

const Counter = mongoose.model('Counter', counterSchema);

// Rating Schema
const ratingSchema = new mongoose.Schema({
  service: String,
  serviceRating: Number,
  time: Number,
  attitude: Number,
  overall: Number,
  comment: String,
  customerCode: String,
  timestamp: { type: Date, default: Date.now }
}, { versionKey: false });

const Rating = mongoose.model('Rating', ratingSchema);

module.exports = { Counter, Rating, mongoose };
