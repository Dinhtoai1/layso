const express = require('express');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { Counter, Rating, mongoose } = require('./mongo-models');
const cron = require('node-cron');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Các biến cấu hình - CHỈ 4 DỊCH VỤ CHO 4 QUẦY
const SERVICES = [
  "Chứng thực Hộ tịch",
  "Văn thư", 
  "Nội vụ - GDĐT - Văn hóa - Khoa học và Thông tin - Y tế - Lao động - Bảo trợ Xã hội",
  "Nông nghiệp Môi trường - Tài chính kế hoạch - Xây dựng và Công thương"
];

// File paths
const usersFile = path.join(__dirname, 'users.json');

// Helper function để map service với số quầy
const serviceToCounter = {
  "Chứng thực Hộ tịch": "1",
  "Văn thư": "2", 
  "Nội vụ - GDĐT - Văn hóa - Khoa học và Thông tin - Y tế - Lao động - Bảo trợ Xã hội": "3",
  "Nông nghiệp Môi trường - Tài chính kế hoạch - Xây dựng và Công thương": "4"
};

function getCounterNumber(service) {
  return serviceToCounter[service] || "1";
}

// Serve static files
app.use(express.static('public'));

// User Schema với mongoose từ mongo-models.js
const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  service: String,
  role: String
}, { versionKey: false });
const User = mongoose.model('User', userSchema);

// API để lấy số mới
app.post('/get-number', async (req, res) => {
  try {
    const { service } = req.body;
    if (!service) {
      return res.status(400).json({ error: 'Thiếu thông tin dịch vụ' });
    }

    // Tìm counter cho service này
    let counter = await Counter.findOne({ service });
    if (!counter) {
      // Tạo mới nếu chưa có
      counter = new Counter({ service, currentNumber: 0 });
    }

    // Tăng số thứ tự
    counter.currentNumber += 1;
    
    // Tạo số theo format [MãQuầy][SốThứTự] - ví dụ: 1001, 2001, 3001
    const counterNumber = getCounterNumber(service);
    const formattedNumber = parseInt(counterNumber) * 1000 + counter.currentNumber;
    
    await counter.save();

    res.json({ 
      number: formattedNumber,
      rawNumber: counter.currentNumber, // Số thứ tự gốc
      counterNumber: counterNumber, // Mã quầy
      service: service 
    });
  } catch (error) {
    console.error('Get number error:', error);
    res.status(500).json({ error: 'Lỗi server khi lấy số' });
  }
});

// API đăng nhập
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Thiếu tài khoản hoặc mật khẩu' });
    }

    // Đọc users từ file JSON thay vì MongoDB
    const users = readUsers();
    const user = users.find(u => u.username === username && u.password === password);
    
    if (!user) {
      console.log(`❌ Đăng nhập thất bại: ${username}`);
      return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });
    }

    console.log(`✅ Đăng nhập thành công: ${username}`);
    res.json({ 
      success: true, 
      user: { 
        username: user.username, 
        service: user.service, 
        role: user.role || 'staff' // Default role là staff nếu không có
      } 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Lỗi server khi đăng nhập' });
  }
});

// API thống kê tổng quan
app.get('/stats', async (req, res) => {
  try {
    const totalRatings = await Rating.countDocuments();
    const counters = await Counter.find();
    
    // Tạo stats chi tiết cho từng dịch vụ
    const serviceStats = {};
    
    SERVICES.forEach(service => {
      const counter = counters.find(c => c.service === service);
      const counterNumber = getCounterNumber(service);
      
      if (counter) {
        const lastCalledRaw = counter.calledNumber || 0;
        const lastCalledFormatted = lastCalledRaw > 0 ? parseInt(counterNumber) * 1000 + lastCalledRaw : 0;
        const waitingCount = counter.currentNumber - counter.calledNumber;
        
        serviceStats[service] = {
          waiting: waitingCount, // Số khách đang chờ
          lastCalled: lastCalledFormatted > 0 ? lastCalledFormatted : 'Chưa có', // Số cuối đã gọi
          currentNumber: counter.currentNumber, // Tổng số đã lấy
          calledNumber: counter.calledNumber // Số đã gọi
        };
      } else {
        serviceStats[service] = {
          waiting: 0,
          lastCalled: 'Chưa có',
          currentNumber: 0,
          calledNumber: 0
        };
      }
    });
    
    res.json({
      totalRatings,
      totalCounters: counters.length,
      services: SERVICES.length,
      serviceStats: serviceStats
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Lỗi server khi lấy thống kê' });
  }
});

// Debug endpoint để xem counters data
app.get('/debug-counters', async (req, res) => {
  try {
    const counters = await Counter.find();
    res.json({
      message: 'Debug Counter Data',
      counters: counters,
      services: SERVICES,
      serviceToCounter: serviceToCounter
    });
  } catch (error) {
    console.error('Debug counters error:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// API để lưu rating
app.post('/submit-rating', async (req, res) => {
  try {
    const { service, ratings, comment, customerCode } = req.body;
    
    if (!service || !ratings) {
      return res.status(400).json({ error: 'Thiếu thông tin đánh giá' });
    }

    const rating = new Rating({
      service,
      serviceRating: ratings.service || 0,
      time: ratings.time || 0,
      attitude: ratings.attitude || 0,
      overall: ratings.overall || 0,
      comment: comment || '',
      customerCode: customerCode || '',
      timestamp: new Date()
    });

    await rating.save();
    res.json({ success: true, message: 'Đánh giá đã được lưu' });
  } catch (error) {
    console.error('Submit rating error:', error);
    res.status(500).json({ error: 'Lỗi server khi lưu đánh giá' });
  }
});

// API quick-rating cho staff
app.post('/quick-rating', async (req, res) => {
  try {
    const { service, rating } = req.body;
    
    if (!service || !rating) {
      return res.status(400).json({ error: 'Thiếu thông tin đánh giá' });
    }

    const newRating = new Rating({
      service,
      serviceRating: rating,
      time: rating,
      attitude: rating,
      overall: rating,
      comment: `Đánh giá nhanh ${rating} sao`,
      customerCode: '',
      timestamp: new Date()
    });

    await newRating.save();
    res.json({ success: true, message: `Đã lưu đánh giá ${rating} sao` });
  } catch (error) {
    console.error('Quick rating error:', error);
    res.status(500).json({ error: 'Lỗi server khi lưu đánh giá nhanh' });
  }
});

// Endpoint để lấy danh sách dịch vụ
app.get('/services', (req, res) => {
  res.json(SERVICES);
});

// API để lấy số hiện tại của từng dịch vụ
app.get('/current-numbers', async (req, res) => {
  try {
    const counters = await Counter.find();
    const currentNumbers = {};
    
    // Khởi tạo tất cả dịch vụ với số 0
    SERVICES.forEach(service => {
      const counterNumber = getCounterNumber(service);
      currentNumbers[service] = {
        formatted: 0, // Số hiển thị
        raw: 0, // Số thứ tự gốc
        counterNumber: counterNumber
      };
    });
    
    // Cập nhật với số thực tế từ database
    counters.forEach(counter => {
      if (counter.currentNumber > 0) {
        const counterNumber = getCounterNumber(counter.service);
        const formattedNumber = parseInt(counterNumber) * 1000 + counter.currentNumber;
        currentNumbers[counter.service] = {
          formatted: formattedNumber,
          raw: counter.currentNumber,
          counterNumber: counterNumber
        };
      }
    });
    
    res.json(currentNumbers);
  } catch (error) {
    console.error('Current numbers error:', error);
    res.status(500).json({ error: 'Lỗi server khi lấy số hiện tại' });
  }
});

// API để reset số thứ tự
app.post('/reset-numbers', async (req, res) => {
  try {
    // Reset tất cả counter về 0
    await Counter.updateMany({}, { currentNumber: 0 });
    res.json({ success: true, message: 'Đã reset tất cả số thứ tự về 0' });
  } catch (error) {
    console.error('Reset numbers error:', error);
    res.status(500).json({ error: 'Lỗi server khi reset số thứ tự' });
  }
});

// API gọi số tiếp theo (cho staff)
app.post('/call-next', async (req, res) => {
  try {
    const { service } = req.body;
    if (!service) {
      return res.status(400).json({ error: 'Thiếu thông tin dịch vụ' });
    }

    // Tìm counter cho service này
    let counter = await Counter.findOne({ service });
    if (!counter) {
      return res.status(404).json({ error: 'Không có khách nào đang chờ' });
    }

    // Kiểm tra xem còn số nào để gọi không
    if (counter.calledNumber >= counter.currentNumber) {
      return res.status(404).json({ error: 'Không có khách nào đang chờ' });
    }

    // Tăng số đã gọi lên 1
    counter.calledNumber += 1;
    await counter.save();

    // Tạo số hiển thị
    const counterNumber = getCounterNumber(service);
    const formattedNumber = parseInt(counterNumber) * 1000 + counter.calledNumber;
    
    res.json({ 
      number: formattedNumber,
      rawNumber: counter.calledNumber,
      counterNumber: counterNumber,
      service: service,
      waitingCount: counter.currentNumber - counter.calledNumber,
      message: `Đang gọi số ${formattedNumber} cho dịch vụ ${service}`
    });
  } catch (error) {
    console.error('Call next error:', error);
    res.status(500).json({ error: 'Lỗi server khi gọi số tiếp theo' });
  }
});

// API gọi lại số cuối (cho staff)
app.post('/recall-last', async (req, res) => {
  try {
    const { service } = req.body;
    if (!service) {
      return res.status(400).json({ error: 'Thiếu thông tin dịch vụ' });
    }

    // Tìm counter cho service này
    const counter = await Counter.findOne({ service });
    if (!counter || counter.currentNumber === 0) {
      return res.status(404).json({ error: 'Chưa có số nào được gọi cho dịch vụ này' });
    }

    // Tạo số theo format [MãQuầy][SốThứTự]
    const counterNumber = getCounterNumber(service);
    const formattedNumber = parseInt(counterNumber) * 1000 + counter.currentNumber;

    res.json({ 
      number: formattedNumber,
      rawNumber: counter.currentNumber,
      counterNumber: counterNumber,
      service: service,
      message: `Đã gọi lại số ${formattedNumber} cho dịch vụ ${service}`
    });
  } catch (error) {
    console.error('Recall last error:', error);
    res.status(500).json({ error: 'Lỗi server khi gọi lại số cuối' });
  }
});

// API để lấy báo cáo đánh giá - ENDPOINT QUAN TRỌNG
app.get('/ratings-report', async (req, res) => {
  try {
    console.log('📊 Bắt đầu tạo báo cáo rating...');
    
    const ratings = await Rating.find().sort({ timestamp: -1 }).limit(1000);
    console.log(`📈 Tìm thấy ${ratings.length} đánh giá`);

    if (ratings.length === 0) {
      return res.json({
        totalRatings: 0,
        averageRatings: { service: 0, time: 0, attitude: 0, overall: 0 },
        serviceBreakdown: {},
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        recentRatings: []
      });
    }

    // Tính toán thống kê
    const totalRatings = ratings.length;
    let totalService = 0, totalTime = 0, totalAttitude = 0, totalOverall = 0;
    const serviceBreakdown = {};
    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    ratings.forEach(rating => {
      totalService += rating.serviceRating || 0;
      totalTime += rating.time || 0;
      totalAttitude += rating.attitude || 0;
      totalOverall += rating.overall || 0;

      // Đếm theo dịch vụ
      const service = rating.service || 'Không xác định';
      if (!serviceBreakdown[service]) {
        serviceBreakdown[service] = { count: 0, avgRating: 0, totalRating: 0 };
      }
      serviceBreakdown[service].count++;
      serviceBreakdown[service].totalRating += (rating.overall || 0);

      // Phân bố điểm số
      const overallRating = Math.round(rating.overall || 0);
      if (overallRating >= 1 && overallRating <= 5) {
        ratingDistribution[overallRating]++;
      }
    });

    // Tính trung bình cho từng dịch vụ
    Object.keys(serviceBreakdown).forEach(service => {
      const data = serviceBreakdown[service];
      data.avgRating = data.count > 0 ? (data.totalRating / data.count).toFixed(1) : 0;
    });

    // Format dữ liệu cho frontend admin-advanced.html
    const result = {
      systemStats: {
        totalRatings,
        totalOverallAverage: totalRatings > 0 ? (totalOverall / totalRatings).toFixed(1) : 0,
        averageOverall: totalRatings > 0 ? (totalOverall / totalRatings).toFixed(1) : 0,
        averageService: totalRatings > 0 ? (totalService / totalRatings).toFixed(1) : 0,
        averageTime: totalRatings > 0 ? (totalTime / totalRatings).toFixed(1) : 0,
        averageAttitude: totalRatings > 0 ? (totalAttitude / totalRatings).toFixed(1) : 0,
        todayRatings: 0, // TODO: Calculate today's ratings
        thisWeekRatings: 0 // TODO: Calculate this week's ratings
      },
      ratings: ratings, // Frontend expect this for star distribution
      serviceStats: serviceBreakdown,
      starDistribution: ratingDistribution,
      recentRatings: ratings.slice(0, 10).map(r => ({
        service: r.service,
        overall: r.overall,
        comment: r.comment,
        timestamp: r.timestamp,
        customerCode: r.customerCode
      })),
      // Backward compatibility
      totalRatings,
      averageRatings: {
        service: totalRatings > 0 ? (totalService / totalRatings).toFixed(1) : 0,
        time: totalRatings > 0 ? (totalTime / totalRatings).toFixed(1) : 0,
        attitude: totalRatings > 0 ? (totalAttitude / totalRatings).toFixed(1) : 0,
        overall: totalRatings > 0 ? (totalOverall / totalRatings).toFixed(1) : 0
      },
      serviceBreakdown,
      ratingDistribution
    };

    console.log('✅ Báo cáo rating hoàn thành');
    res.json(result);
  } catch (error) {
    console.error('❌ Lỗi ratings-report:', error);
    res.status(500).json({ error: 'Lỗi server khi tạo báo cáo: ' + error.message });
  }
});

// Endpoint để xuất Excel
app.get('/export-excel', async (req, res) => {
  try {
    const ratings = await Rating.find().sort({ timestamp: -1 });
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Đánh giá dịch vụ');

    // Header
    worksheet.addRow(['STT', 'Dịch vụ', 'Đánh giá dịch vụ', 'Thời gian xử lý', 'Thái độ nhân viên', 'Đánh giá chung', 'Góp ý', 'Mã khách hàng', 'Thời gian']);

    // Data
    ratings.forEach((rating, index) => {
      worksheet.addRow([
        index + 1,
        rating.service || '',
        rating.serviceRating || 0,
        rating.time || 0,
        rating.attitude || 0,
        rating.overall || 0,
        rating.comment || '',
        rating.customerCode || '',
        rating.timestamp ? new Date(rating.timestamp).toLocaleString('vi-VN') : ''
      ]);
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=danh-gia-dich-vu.xlsx');

    // Write to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export excel error:', error);
    res.status(500).json({ error: 'Lỗi server khi xuất Excel' });
  }
});

// Alias cho export Excel (tương thích với admin page)
app.get('/export-ratings-excel', async (req, res) => {
  try {
    const ratings = await Rating.find().sort({ timestamp: -1 });
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Đánh giá dịch vụ');

    // Header
    worksheet.addRow(['STT', 'Dịch vụ', 'Đánh giá dịch vụ', 'Thời gian xử lý', 'Thái độ nhân viên', 'Đánh giá chung', 'Góp ý', 'Mã khách hàng', 'Thời gian']);

    // Data
    ratings.forEach((rating, index) => {
      worksheet.addRow([
        index + 1,
        rating.service || '',
        rating.serviceRating || 0,
        rating.time || 0,
        rating.attitude || 0,
        rating.overall || 0,
        rating.comment || '',
        rating.customerCode || '',
        rating.timestamp ? new Date(rating.timestamp).toLocaleString('vi-VN') : ''
      ]);
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=danh-gia-dich-vu.xlsx');

    // Write to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export ratings excel error:', error);
    res.status(500).json({ error: 'Lỗi server khi xuất Excel đánh giá' });
  }
});

// Đổi mật khẩu
app.post('/change-password', async (req, res) => {
  try {
    const { username, oldPassword, newPassword } = req.body;
    if (!username || !oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Thiếu thông tin đổi mật khẩu' });
    }
    const user = await User.findOne({ username, password: oldPassword });
    if (!user) {
      return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu cũ' });
    }
    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Đổi mật khẩu thành công' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Lỗi server khi đổi mật khẩu' });
  }
});

// API cho all-counters-display.html
app.get('/latest-calls', async (req, res) => {
  try {
    const counters = await Counter.find();
    const latestCalls = {};
    
    counters.forEach(counter => {
      // Chỉ hiển thị số đã gọi, không phải số khách mới lấy
      if (counter.calledNumber > 0) {
        const counterNumber = getCounterNumber(counter.service);
        const formattedNumber = parseInt(counterNumber) * 1000 + counter.calledNumber;
        
        latestCalls[counter.service] = {
          number: formattedNumber,
          rawNumber: counter.calledNumber,
          time: new Date().toISOString(),
          counter: counterNumber,
          waitingCount: counter.currentNumber - counter.calledNumber
        };
      }
    });
    
    res.json(latestCalls);
  } catch (error) {
    console.error('Latest calls error:', error);
    res.status(500).json({ error: 'Lỗi server khi lấy lệnh gọi mới nhất' });
  }
});

app.get('/all-counters-status', async (req, res) => {
  try {
    const counters = await Counter.find();
    const result = {
      counters: SERVICES.map(service => {
        const counter = counters.find(c => c.service === service);
        const counterNumber = getCounterNumber(service);
        const rawNumber = counter ? counter.currentNumber : 0;
        const formattedNumber = rawNumber > 0 ? parseInt(counterNumber) * 1000 + rawNumber : 0;
        
        return {
          service,
          counterNumber: counterNumber,
          currentCalling: formattedNumber > 0 ? {
            number: formattedNumber,
            time: new Date()
          } : null,
          waitingCount: 0, // No queue system
          currentNumber: formattedNumber, // Số hiển thị đã format
          rawNumber: rawNumber, // Số thứ tự gốc
          waiting: 0,
          lastCalled: formattedNumber,
          status: 'active'
        };
      })
    };
    
    res.json(result);
  } catch (error) {
    console.error('All counters status error:', error);
    res.status(500).json({ error: 'Lỗi server khi lấy trạng thái quầy' });
  }
});

// Helper function để map service với số quầy - đã define ở đầu file
// const serviceToCounter = ...

// Tự động reset số thứ tự mỗi ngày lúc 0h00 - CHỈ RESET COUNTER, KHÔNG RESET RATING
cron.schedule('0 0 * * *', async () => {
  try {
    console.log('🔄 Bắt đầu reset số thứ tự hàng ngày...');
    // CHỈ reset counter numbers, GIỮ NGUYÊN rating data để đánh giá cán bộ
    await Counter.updateMany({}, { 
      currentNumber: 0,
      calledNumber: 0 
    });
    console.log('✅ Đã reset tất cả số thứ tự về 0 (Rating data được bảo toàn)');
  } catch (error) {
    console.error('❌ Lỗi khi reset số thứ tự:', error);
  }
}, {
  timezone: "Asia/Ho_Chi_Minh"
});

// Endpoint cho trang chủ
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint cho admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Các API cũ cho tương thích ngược (sử dụng file users.json)
const readUsers = () => {
  if (fs.existsSync(usersFile)) {
    return JSON.parse(fs.readFileSync(usersFile, 'utf8'));
  }
  return [];
};

const writeUsers = (users) => {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
};

// API tạo tài khoản mới (vẫn dùng file)
app.post('/create-account', (req, res) => {
  try {
    const { username, password, service, role } = req.body;
    if (!username || !password || !service || !role) {
      return res.status(400).json({ error: 'Thiếu thông tin tài khoản' });
    }

    const users = readUsers();
    if (users.find(u => u.username === username)) {
      return res.status(400).json({ error: 'Tài khoản đã tồn tại' });
    }

    users.push({ username, password, service, role });
    writeUsers(users);
    
    res.json({ success: true, message: 'Tạo tài khoản thành công' });
  } catch (error) {
    console.error('Create account error:', error);
    res.status(500).json({ error: 'Lỗi server khi tạo tài khoản' });
  }
});

// API lấy danh sách tài khoản (vẫn dùng file)
app.get('/users', (req, res) => {
  try {
    const users = readUsers();
    res.json(users.map(u => ({ username: u.username, service: u.service, role: u.role })));
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Lỗi server khi lấy danh sách tài khoản' });
  }
});

// API xóa tài khoản (vẫn dùng file)
app.delete('/delete-account/:username', (req, res) => {
  try {
    const { username } = req.params;
    const users = readUsers();
    const filteredUsers = users.filter(u => u.username !== username);
    
    if (users.length === filteredUsers.length) {
      return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
    }
    
    writeUsers(filteredUsers);
    res.json({ success: true, message: 'Xóa tài khoản thành công' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Lỗi server khi xóa tài khoản' });
  }
});

// Start server
app.listen(PORT, HOST, () => {
  console.log(`🚀 Server chạy tại http://${HOST}:${PORT}`);
  console.log('📋 Các endpoint có sẵn:');
  console.log('   GET  / - Trang chủ lấy số');
  console.log('   POST /get-number - Lấy số thứ tự mới');
  console.log('   POST /call-next - Gọi số tiếp theo (Staff)');
  console.log('   POST /recall-last - Gọi lại số cuối (Staff)');
  console.log('   POST /submit-rating - Gửi đánh giá');
  console.log('   GET  /services - Danh sách dịch vụ');
  console.log('   GET  /current-numbers - Số hiện tại các dịch vụ');
  console.log('   POST /reset-numbers - Reset tất cả số về 0');
  console.log('   GET  /ratings-report - Báo cáo đánh giá nâng cao');
  console.log('   GET  /export-excel - Xuất Excel tổng quát');
  console.log('   GET  /export-ratings-excel - Xuất Excel đánh giá');
  console.log('   GET  /latest-calls - Lệnh gọi mới nhất (Display)');
  console.log('   GET  /all-counters-status - Trạng thái tất cả quầy');
  console.log('   POST /login - Đăng nhập');
  console.log('   GET  /stats - Thống kê tổng quan');
  console.log('   POST /change-password - Đổi mật khẩu');
  console.log('   POST /create-account - Tạo tài khoản mới');
  console.log('   GET  /users - Danh sách tài khoản');
  console.log('   DELETE /delete-account/:username - Xóa tài khoản');
  console.log('🔄 Tự động reset số thứ tự mỗi ngày 0h00');
});

// Debug endpoint để kiểm tra dữ liệu MongoDB
app.get('/debug/mongodb', async (req, res) => {
  try {
    const counters = await Counter.find();
    const ratings = await Rating.find().limit(10).sort({ timestamp: -1 });
    
    res.json({
      message: 'Dữ liệu MongoDB hiện tại',
      counters: counters,
      ratingsCount: await Rating.countDocuments(),
      latestRatings: ratings,
      mongooseConnectionState: mongoose.connection.readyState // 1 = connected
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API reset counters để khởi tạo lại với service names mới
app.post('/reset-counters', async (req, res) => {
  try {
    // Xóa tất cả counter cũ
    await Counter.deleteMany({});
    
    // Tạo lại counters với service names mới
    const newCounters = SERVICES.map(service => ({
      service: service,
      currentNumber: 0,
      calledNumber: 0
    }));
    
    await Counter.insertMany(newCounters);
    
    res.json({ 
      success: true, 
      message: 'Đã reset tất cả counters với service names mới',
      services: SERVICES
    });
  } catch (error) {
    console.error('Reset counters error:', error);
    res.status(500).json({ error: 'Lỗi server khi reset counters' });
  }
});

// API để xem rating history theo thời gian (không bị reset)
app.get('/ratings-history', async (req, res) => {
  try {
    const { service, days = 30 } = req.query;
    
    // Tính ngày bắt đầu
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    let query = { timestamp: { $gte: startDate } };
    if (service && service !== 'all') {
      query.service = service;
    }
    
    const ratings = await Rating.find(query)
      .sort({ timestamp: -1 })
      .limit(1000);
    
    // Thống kê tổng hợp
    const stats = {
      totalRatings: ratings.length,
      averageOverall: ratings.length > 0 ? 
        ratings.reduce((sum, r) => sum + r.overall, 0) / ratings.length : 0,
      averageService: ratings.length > 0 ? 
        ratings.reduce((sum, r) => sum + r.serviceRating, 0) / ratings.length : 0,
      averageTime: ratings.length > 0 ? 
        ratings.reduce((sum, r) => sum + r.time, 0) / ratings.length : 0,
      averageAttitude: ratings.length > 0 ? 
        ratings.reduce((sum, r) => sum + r.attitude, 0) / ratings.length : 0,
      ratingDistribution: {
        1: ratings.filter(r => r.overall === 1).length,
        2: ratings.filter(r => r.overall === 2).length,
        3: ratings.filter(r => r.overall === 3).length,
        4: ratings.filter(r => r.overall === 4).length,
        5: ratings.filter(r => r.overall === 5).length
      }
    };
    
    res.json({
      stats,
      ratings: ratings.slice(0, 100), // Chỉ trả về 100 rating gần nhất để tránh quá tải
      queryParams: { service, days }
    });
  } catch (error) {
    console.error('Ratings history error:', error);
    res.status(500).json({ error: 'Lỗi server khi lấy lịch sử đánh giá' });
  }
});
