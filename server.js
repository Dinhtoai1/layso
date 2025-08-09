const express = require('express');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Cho phép truy cập từ mọi IP trong mạng

app.use(express.json());
app.use(express.static('public'));

// File paths
const usersFile = path.join(__dirname, 'users.json');
const historyFile = path.join(__dirname, 'history.json');
const ratingsFile = path.join(__dirname, 'ratings.json');

// Service configuration
const SERVICES = [
  "Chứng thực - Hộ tịch",
  "Văn thư", 
  "Nội vụ - GDĐT - Văn hóa - Khoa học và Thông tin - Y tế - Lao động - Bảo trợ Xã hội",
  "Nông nghiệp và Môi trường - Tài chính Kế hoạch - Xây dựng và Công thương"
];

const prefixMap = {
  [SERVICES[0]]: "1",
  [SERVICES[1]]: "2", 
  [SERVICES[2]]: "3",
  [SERVICES[3]]: "4"
};

// Initialize data structures
let queue = {};
let currentNumber = {};
let latestCalls = {};

SERVICES.forEach(service => {
  queue[service] = [];
  currentNumber[service] = 0;
  latestCalls[service] = null;
});

// Utility functions
function readJsonFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    return [];
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return [];
  }
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error);
    return false;
  }
}

function saveHistory(entry) {
  const history = readJsonFile(historyFile);
  history.push(entry);
  return writeJsonFile(historyFile, history);
}

function saveRating(rating) {
  const ratings = readJsonFile(ratingsFile);
  
  // Chỉ thêm id và timestamp nếu chưa có
  if (!rating.id) {
    rating.id = Date.now();
  }
  if (!rating.timestamp) {
    rating.timestamp = new Date().toISOString();
  }
  
  ratings.push(rating);
  return writeJsonFile(ratingsFile, ratings);
}

function isValidService(service) {
  return SERVICES.includes(service);
}

function validateRating(rating) {
  const { service, serviceRating, time, attitude, overall } = rating;
  
  if (!isValidService(service)) {
    return { valid: false, error: 'Lĩnh vực dịch vụ không hợp lệ' };
  }
  
  const ratings = [serviceRating, time, attitude, overall].map(Number);
  if (ratings.some(r => isNaN(r) || r < 1 || r > 5)) {
    return { valid: false, error: 'Điểm đánh giá không hợp lệ (phải từ 1-5)' };
  }
  
  return { valid: true };
}

// API Routes

// Authentication
app.post('/login', (req, res) => {
  try {
    const users = readJsonFile(usersFile);
    if (users.length === 0) {
      return res.status(500).json({ error: 'Không tìm thấy dữ liệu người dùng' });
    }
    
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Thiếu thông tin đăng nhập' });
    }
    
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) {
      return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });
    }
    
    res.json({ service: user.service });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Lỗi server khi đăng nhập' });
  }
});

// Queue Management
app.post('/get-number', (req, res) => {
  try {
    const { service } = req.body;
    if (!isValidService(service)) {
      return res.status(400).json({ 
        error: 'Lĩnh vực dịch vụ không hợp lệ', 
        availableServices: SERVICES 
      });
    }
    
    const number = queue[service].length + 1;
    const code = `${prefixMap[service]}${number.toString().padStart(3, '0')}`;
    queue[service].push(code);
    
    console.log(`📋 Lấy số: ${code} cho dịch vụ: ${service}`);
    res.json({ number: code });
  } catch (error) {
    console.error('Get number error:', error);
    res.status(500).json({ error: 'Lỗi server khi lấy số' });
  }
});

app.post('/call-next', (req, res) => {
  try {
    const { service } = req.body;
    if (!isValidService(service)) {
      return res.status(400).json({ error: 'Lĩnh vực dịch vụ không hợp lệ' });
    }
    
    if (!queue[service] || queue[service].length === 0) {
      return res.status(404).json({ error: 'Không có khách trong hàng đợi' });
    }

    currentNumber[service]++;
    const code = queue[service].shift();
    const timestamp = new Date().toISOString();

    // Save to history
    const record = { service, number: code, time: timestamp };
    if (!saveHistory(record)) {
      console.error('Failed to save history');
    }

    // Update latest call
    latestCalls[service] = {
      number: code,
      service: service,
      time: timestamp,
      isRecall: false
    };
    
    console.log(`📞 Gọi số: ${code} cho dịch vụ: ${service}`);
    res.json({ number: code });
  } catch (error) {
    console.error('Call next error:', error);
    res.status(500).json({ error: 'Lỗi server khi gọi số' });
  }
});

app.post('/recall-last', (req, res) => {
  try {
    const { service } = req.body;
    if (!isValidService(service)) {
      return res.status(400).json({ error: 'Lĩnh vực dịch vụ không hợp lệ' });
    }

    const history = readJsonFile(historyFile);
    const latestCall = history
      .filter(entry => entry.service === service)
      .sort((a, b) => new Date(b.time) - new Date(a.time))[0];
    
    if (!latestCall) {
      return res.status(404).json({ error: 'Không có số nào đã được gọi cho lĩnh vực này' });
    }

    const timestamp = new Date().toISOString();
    const recallRecord = {
      service: service,
      number: latestCall.number,
      time: timestamp,
      isRecall: true
    };
    
    if (!saveHistory(recallRecord)) {
      return res.status(500).json({ error: 'Lỗi khi lưu lịch sử gọi lại' });
    }

    latestCalls[service] = {
      number: latestCall.number,
      service: service,
      time: timestamp,
      isRecall: true
    };

    console.log(`🔄 Gọi lại số: ${latestCall.number} cho dịch vụ: ${service}`);
    res.json({ 
      success: true, 
      number: latestCall.number,
      message: 'Đã gọi lại số thành công'
    });
  } catch (error) {
    console.error('Recall error:', error);
    res.status(500).json({ error: 'Lỗi server khi gọi lại số' });
  }
});

// Statistics and Status
app.get('/stats', (req, res) => {
  try {
    const stats = {};
    SERVICES.forEach(service => {
      stats[service] = {
        waiting: queue[service].length,
        lastCalled: currentNumber[service]
      };
    });
    res.json(stats);
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Lỗi server khi lấy thống kê' });
  }
});

app.get('/latest-calls', (req, res) => {
  try {
    const filteredCalls = {};
    const history = readJsonFile(historyFile);
    
    SERVICES.forEach(service => {
      const latestCall = history
        .filter(entry => entry.service === service)
        .sort((a, b) => new Date(b.time) - new Date(a.time))[0];
      
      // Chỉ hiển thị số đang gọi nếu còn khách chờ hoặc cuộc gọi vừa mới (trong vòng 5 phút)
      if (latestCall) {
        const callTime = new Date(latestCall.time);
        const now = new Date();
        const timeDiff = (now - callTime) / (1000 * 60); // phút
        
        // Hiển thị số gọi nếu:
        // 1. Còn khách chờ (có thể đang xử lý khách hiện tại)
        // 2. Hoặc cuộc gọi trong vòng 5 phút gần đây
        if (queue[service].length > 0 || timeDiff <= 5) {
          filteredCalls[service] = {
            number: latestCall.number,
            time: latestCall.time,
            isRecall: latestCall.isRecall || false
          };
        } else {
          filteredCalls[service] = null;
        }
      } else {
        filteredCalls[service] = null;
      }
    });
    
    res.json(filteredCalls);
  } catch (error) {
    console.error('Latest calls error:', error);
    res.status(500).json({ error: 'Lỗi server khi lấy thông tin lệnh gọi' });
  }
});

app.get('/all-counters-status', (req, res) => {
  try {
    const countersStatus = SERVICES.map(service => {
      const history = readJsonFile(historyFile);
      const latestCall = history
        .filter(entry => entry.service === service)
        .sort((a, b) => new Date(b.time) - new Date(a.time))[0];
      
      // Chỉ hiển thị số đang gọi nếu còn khách chờ hoặc cuộc gọi vừa mới (trong vòng 5 phút)
      let currentCalling = null;
      if (latestCall) {
        const callTime = new Date(latestCall.time);
        const now = new Date();
        const timeDiff = (now - callTime) / (1000 * 60); // phút
        
        // Hiển thị số gọi nếu:
        // 1. Còn khách chờ (có thể đang xử lý khách hiện tại)
        // 2. Hoặc cuộc gọi trong vòng 5 phút gần đây
        if (queue[service].length > 0 || timeDiff <= 5) {
          currentCalling = {
            number: latestCall.number,
            time: latestCall.time,
            isRecall: latestCall.isRecall || false
          };
        }
      }
      
      return {
        service: service,
        counterNumber: prefixMap[service],
        currentCalling: currentCalling,
        waitingCount: queue[service].length,
        lastUpdated: new Date().toISOString()
      };
    });
    
    res.json({
      counters: countersStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Counters status error:', error);
    res.status(500).json({ error: 'Lỗi server khi lấy trạng thái quầy' });
  }
});

// API để lấy lịch sử gọi số cho tra cứu mã khách hàng
app.get('/api/history', (req, res) => {
  try {
    const history = readJsonFile(historyFile);
    res.json(history);
  } catch (error) {
    console.error('History API error:', error);
    res.status(500).json({ error: 'Lỗi server khi lấy lịch sử' });
  }
});

// Rating System - Cập nhật để hỗ trợ format mới
app.post('/submit-rating', (req, res) => {
  try {
    console.log('📝 Nhận đánh giá từ client:', req.body);
    
    // Hỗ trợ cả format cũ và mới
    const { service, serviceRating, time, attitude, overall, comment, customerCode } = req.body;
    
    // Kiểm tra service trước
    if (!service) {
      return res.status(400).json({ error: 'Thiếu thông tin dịch vụ' });
    }

    if (!SERVICES.includes(service)) {
      return res.status(400).json({ error: 'Lĩnh vực dịch vụ không hợp lệ' });
    }
    
    // Format mới (chỉ có service, overall, comment)
    if (overall !== undefined && !serviceRating && !time && !attitude) {
      const overallNumber = Number(overall);
      
      // Validate overall rating
      if (isNaN(overallNumber) || overallNumber < 1 || overallNumber > 5) {
        return res.status(400).json({ error: 'Đánh giá phải từ 1 đến 5 sao' });
      }
      
      const newRating = {
        service,
        overall: overallNumber,
        comment: comment || '',
        customerCode: customerCode || '',
        timestamp: new Date().toISOString(),
        id: Date.now()
      };
      
      console.log('📝 Lưu đánh giá format mới:', newRating);
      
      if (!saveRating(newRating)) {
        return res.status(500).json({ error: 'Lỗi khi lưu đánh giá' });
      }
      
      console.log('✅ Đánh giá mới đã lưu thành công');
      return res.json({ 
        success: true, 
        message: 'Đánh giá đã được lưu thành công'
      });
    }
    
    // Format cũ (đầy đủ các trường: serviceRating, time, attitude, overall)
    if (serviceRating !== undefined && time !== undefined && 
        attitude !== undefined && overall !== undefined) {
      
      console.log('📝 Xử lý đánh giá format cũ');
      
      // Validate rating data cho format cũ
      const rating = {
        service,
        serviceRating: Number(serviceRating),
        time: Number(time),
        attitude: Number(attitude),
        overall: Number(overall),
        comment: comment || '',
        timestamp: new Date().toISOString(),
        id: Date.now()
      };
      
      const validation = validateRating(rating);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      if (!saveRating(rating)) {
        return res.status(500).json({ error: 'Lỗi khi lưu đánh giá' });
      }

      console.log('✅ Đánh giá format cũ đã lưu thành công');
      return res.json({ success: true, message: 'Đánh giá đã được lưu thành công' });
    }
    
    // Nếu không khớp format nào
    return res.status(400).json({ 
      error: 'Format đánh giá không hợp lệ. Cần có ít nhất service và overall.' 
    });

  } catch (error) {
    console.error('❌ Lỗi server khi xử lý đánh giá:', error);
    res.status(500).json({ error: 'Lỗi server nội bộ' });
  }
});

app.get('/ratings-report', (req, res) => {
  try {
    const ratings = readJsonFile(ratingsFile);
    const totalRatings = ratings.length;
    
    if (totalRatings === 0) {
      return res.json({
        totalRatings: 0,
        averages: { serviceRating: 0, time: 0, attitude: 0, overall: 0 },
        serviceStats: {},
        ratings: []
      });
    }

    // Phân biệt format cũ và mới - dựa trên cấu trúc dữ liệu thực tế
    const oldFormatRatings = ratings.filter(r => 
      r.serviceRating !== undefined && 
      r.time !== undefined && 
      r.attitude !== undefined
    );
    const newFormatRatings = ratings.filter(r => 
      r.serviceRating === undefined && 
      r.overall !== undefined
    );
    
    console.log(`📊 Phân tích ${totalRatings} đánh giá: ${oldFormatRatings.length} format cũ (5 tiêu chí), ${newFormatRatings.length} format mới (1 tiêu chí)`);

    // Tính điểm trung bình cho format cũ (5 tiêu chí)
    let averages = { serviceRating: 0, time: 0, attitude: 0, overall: 0 };
    
    if (oldFormatRatings.length > 0) {
      averages = {
        serviceRating: parseFloat((oldFormatRatings.reduce((sum, r) => sum + r.serviceRating, 0) / oldFormatRatings.length).toFixed(2)),
        time: parseFloat((oldFormatRatings.reduce((sum, r) => sum + r.time, 0) / oldFormatRatings.length).toFixed(2)),
        attitude: parseFloat((oldFormatRatings.reduce((sum, r) => sum + r.attitude, 0) / oldFormatRatings.length).toFixed(2)),
        overall: parseFloat((oldFormatRatings.reduce((sum, r) => sum + r.overall, 0) / oldFormatRatings.length).toFixed(2))
      };
    }
    
    // Tính điểm trung bình cho format mới (1 tiêu chí)
    const newFormatAverage = newFormatRatings.length > 0 
      ? parseFloat((newFormatRatings.reduce((sum, r) => sum + r.overall, 0) / newFormatRatings.length).toFixed(2))
      : 0;

    // Tính tổng điểm trung bình chung cho tất cả đánh giá overall
    const allOverallRatings = ratings.filter(r => r.overall !== undefined);
    const totalOverallAverage = allOverallRatings.length > 0 
      ? parseFloat((allOverallRatings.reduce((sum, r) => sum + r.overall, 0) / allOverallRatings.length).toFixed(2))
      : 0;

    // Thống kê theo dịch vụ với thông tin chi tiết
    const serviceStats = {};
    SERVICES.forEach(service => {
      const serviceOldRatings = oldFormatRatings.filter(r => r.service === service);
      const serviceNewRatings = newFormatRatings.filter(r => r.service === service);
      const serviceAllRatings = ratings.filter(r => r.service === service);
      
      if (serviceAllRatings.length > 0) {
        // Thống kê cho format cũ (5 tiêu chí)
        const oldStats = serviceOldRatings.length > 0 ? {
          count: serviceOldRatings.length,
          averages: {
            serviceRating: parseFloat((serviceOldRatings.reduce((sum, r) => sum + r.serviceRating, 0) / serviceOldRatings.length).toFixed(2)),
            time: parseFloat((serviceOldRatings.reduce((sum, r) => sum + r.time, 0) / serviceOldRatings.length).toFixed(2)),
            attitude: parseFloat((serviceOldRatings.reduce((sum, r) => sum + r.attitude, 0) / serviceOldRatings.length).toFixed(2)),
            overall: parseFloat((serviceOldRatings.reduce((sum, r) => sum + r.overall, 0) / serviceOldRatings.length).toFixed(2))
          }
        } : {
          count: 0,
          averages: { serviceRating: 0, time: 0, attitude: 0, overall: 0 }
        };

        // Thống kê cho format mới (1 tiêu chí)
        const newStats = {
          count: serviceNewRatings.length,
          average: serviceNewRatings.length > 0 
            ? parseFloat((serviceNewRatings.reduce((sum, r) => sum + r.overall, 0) / serviceNewRatings.length).toFixed(2))
            : 0
        };

        // Thống kê tổng hợp cho dịch vụ
        const serviceOverallRatings = serviceAllRatings.filter(r => r.overall !== undefined);
        const serviceOverallAverage = serviceOverallRatings.length > 0 
          ? parseFloat((serviceOverallRatings.reduce((sum, r) => sum + r.overall, 0) / serviceOverallRatings.length).toFixed(2))
          : 0;

        // Phân bố điểm số (1-5 sao)
        const distribution = {};
        for (let i = 1; i <= 5; i++) {
          distribution[`star${i}`] = serviceOverallRatings.filter(r => r.overall === i).length;
        }

        serviceStats[service] = {
          totalCount: serviceAllRatings.length,
          overallAverage: serviceOverallAverage,
          distribution: distribution,
          oldFormat: oldStats,
          newFormat: newStats,
          hasComments: serviceAllRatings.filter(r => r.comment && r.comment.trim() !== '').length,
          recentRatings: serviceAllRatings
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 5) // 5 đánh giá gần nhất
        };
      }
    });

    // Thống kê tổng hợp hệ thống
    const systemStats = {
      totalRatings,
      oldFormatCount: oldFormatRatings.length,
      newFormatCount: newFormatRatings.length,
      totalOverallAverage,
      averages, // Điểm TB cho format cũ
      newFormatAverage, // Điểm TB cho format mới
      ratingsWithComments: ratings.filter(r => r.comment && r.comment.trim() !== '').length,
      ratingsWithCustomerCode: ratings.filter(r => r.customerCode && r.customerCode.trim() !== '').length,
      todayRatings: ratings.filter(r => {
        const ratingDate = new Date(r.timestamp);
        const today = new Date();
        return ratingDate.toDateString() === today.toDateString();
      }).length,
      thisWeekRatings: ratings.filter(r => {
        const ratingDate = new Date(r.timestamp);
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        return ratingDate >= weekAgo;
      }).length
    };

    res.json({
      systemStats,
      serviceStats,
      ratings: ratings.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    });
  } catch (error) {
    console.error('Ratings report error:', error);
    res.status(500).json({ error: 'Lỗi server khi lấy báo cáo' });
  }
});

// API xuất Excel báo cáo đánh giá
app.get('/export-ratings-excel', async (req, res) => {
  try {
    const ratings = readJsonFile(ratingsFile);
    
    // Tạo workbook mới
    const workbook = new ExcelJS.Workbook();
    workbook.properties.title = 'Báo cáo đánh giá dịch vụ';
    workbook.properties.subject = 'Thống kê và phân tích đánh giá';
    workbook.properties.creator = 'Hệ thống xếp hàng LaySo';
    workbook.properties.created = new Date();

    // Sheet 1: Tổng quan
    const summarySheet = workbook.addWorksheet('Tổng quan', {
      pageSetup: { orientation: 'landscape', fitToPage: true }
    });

    // Tiêu đề chính
    summarySheet.mergeCells('A1:H1');
    const titleCell = summarySheet.getCell('A1');
    titleCell.value = 'BÁO CÁO ĐÁNH GIÁ CHẤT LƯỢNG DỊCH VỤ';
    titleCell.font = { size: 16, bold: true, color: { argb: 'FF0066CC' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F8FF' } };
    summarySheet.getRow(1).height = 30;

    // Thông tin báo cáo
    const infoStartRow = 3;
    summarySheet.getCell(`A${infoStartRow}`).value = 'Thời gian tạo báo cáo:';
    summarySheet.getCell(`B${infoStartRow}`).value = new Date().toLocaleString('vi-VN');
    summarySheet.getCell(`A${infoStartRow + 1}`).value = 'Tổng số đánh giá:';
    summarySheet.getCell(`B${infoStartRow + 1}`).value = ratings.length;

    // Phân loại dữ liệu
    const oldFormatRatings = ratings.filter(r => r.serviceRating !== undefined);
    const newFormatRatings = ratings.filter(r => r.serviceRating === undefined && r.overall !== undefined);

    summarySheet.getCell(`A${infoStartRow + 2}`).value = 'Đánh giá chi tiết (5 tiêu chí):';
    summarySheet.getCell(`B${infoStartRow + 2}`).value = oldFormatRatings.length;
    summarySheet.getCell(`A${infoStartRow + 3}`).value = 'Đánh giá tổng quan (1 tiêu chí):';
    summarySheet.getCell(`B${infoStartRow + 3}`).value = newFormatRatings.length;

    // Thống kê theo dịch vụ
    let currentRow = infoStartRow + 5;
    summarySheet.getCell(`A${currentRow}`).value = 'THỐNG KÊ THEO DỊCH VỤ';
    summarySheet.getCell(`A${currentRow}`).font = { size: 14, bold: true, color: { argb: 'FF0066CC' } };
    currentRow += 2;

    // Header cho thống kê dịch vụ
    const serviceHeaders = ['Dịch vụ', 'Tổng đánh giá', 'Đánh giá chi tiết', 'Đánh giá tổng quan', 'Điểm TB chi tiết', 'Điểm TB tổng quan'];
    serviceHeaders.forEach((header, index) => {
      const cell = summarySheet.getCell(currentRow, index + 1);
      cell.value = header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' }
      };
    });
    currentRow++;

    // Dữ liệu thống kê theo dịch vụ
    SERVICES.forEach(service => {
      const serviceOldRatings = oldFormatRatings.filter(r => r.service === service);
      const serviceNewRatings = newFormatRatings.filter(r => r.service === service);
      
      if (serviceOldRatings.length > 0 || serviceNewRatings.length > 0) {
        const totalCount = serviceOldRatings.length + serviceNewRatings.length;
        const oldAvg = serviceOldRatings.length > 0 
          ? (serviceOldRatings.reduce((sum, r) => sum + r.overall, 0) / serviceOldRatings.length).toFixed(2)
          : 'N/A';
        const newAvg = serviceNewRatings.length > 0 
          ? (serviceNewRatings.reduce((sum, r) => sum + r.overall, 0) / serviceNewRatings.length).toFixed(2)
          : 'N/A';

        const rowData = [service, totalCount, serviceOldRatings.length, serviceNewRatings.length, oldAvg, newAvg];
        rowData.forEach((data, index) => {
          const cell = summarySheet.getCell(currentRow, index + 1);
          cell.value = data;
          cell.border = {
            top: { style: 'thin' }, bottom: { style: 'thin' },
            left: { style: 'thin' }, right: { style: 'thin' }
          };
          if (index > 0) cell.alignment = { horizontal: 'center' };
        });
        currentRow++;
      }
    });

    // Tự động điều chỉnh độ rộng cột
    summarySheet.columns.forEach(column => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: false }, cell => {
        const length = cell.value ? cell.value.toString().length : 0;
        if (length > maxLength) maxLength = length;
      });
      column.width = Math.min(Math.max(maxLength + 2, 12), 50);
    });

    // Sheet 2: Chi tiết đánh giá
    const detailSheet = workbook.addWorksheet('Chi tiết đánh giá', {
      pageSetup: { orientation: 'landscape', fitToPage: true }
    });

    // Header cho sheet chi tiết
    const detailHeaders = ['STT', 'Thời gian', 'Dịch vụ', 'Loại đánh giá', 'Mã khách hàng', 'Điểm tổng quan', 'Điểm dịch vụ', 'Điểm thời gian', 'Điểm thái độ', 'Nhận xét'];
    detailHeaders.forEach((header, index) => {
      const cell = detailSheet.getCell(1, index + 1);
      cell.value = header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF70AD47' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' }
      };
    });

    // Dữ liệu chi tiết
    const sortedRatings = ratings.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    sortedRatings.forEach((rating, index) => {
      const rowIndex = index + 2;
      const isOldFormat = rating.serviceRating !== undefined;
      
      const rowData = [
        index + 1,
        new Date(rating.timestamp).toLocaleString('vi-VN'),
        rating.service,
        isOldFormat ? 'Chi tiết (5 tiêu chí)' : 'Tổng quan (1 tiêu chí)',
        rating.customerCode || '',
        rating.overall || '',
        isOldFormat ? rating.serviceRating : 'N/A',
        isOldFormat ? rating.time : 'N/A',
        isOldFormat ? rating.attitude : 'N/A',
        rating.comment || ''
      ];

      rowData.forEach((data, colIndex) => {
        const cell = detailSheet.getCell(rowIndex, colIndex + 1);
        cell.value = data;
        cell.border = {
          top: { style: 'thin' }, bottom: { style: 'thin' },
          left: { style: 'thin' }, right: { style: 'thin' }
        };
        
        // Tô màu xen kẽ
        if (rowIndex % 2 === 0) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } };
        }
        
        // Căn giữa cho số
        if (colIndex === 0 || (colIndex >= 5 && colIndex <= 8)) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      });
    });

    // Tự động điều chỉnh độ rộng cột cho sheet chi tiết
    detailSheet.columns.forEach(column => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: false }, cell => {
        const length = cell.value ? cell.value.toString().length : 0;
        if (length > maxLength) maxLength = length;
      });
      column.width = Math.min(Math.max(maxLength + 2, 10), 40);
    });

    // Thiết lập response
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Bao_cao_danh_gia_${new Date().toISOString().split('T')[0]}.xlsx"`);
    
    // Gửi file
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Excel export error:', error);
    res.status(500).json({ error: 'Lỗi server khi xuất Excel' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
  console.log(`📋 Hỗ trợ ${SERVICES.length} lĩnh vực dịch vụ`);
  console.log('📊 Endpoints có sẵn:');
  console.log('  POST /login - Đăng nhập nhân viên');
  console.log('  POST /get-number - Lấy số thứ tự');
  console.log('  POST /call-next - Gọi khách tiếp theo');
  console.log('  POST /recall-last - Gọi lại số gần nhất');
  console.log('  GET  /stats - Thống kê hàng đợi');
  console.log('  GET  /latest-calls - Lệnh gọi gần nhất');
  console.log('  GET  /all-counters-status - Trạng thái tất cả quầy');
  console.log('  POST /submit-rating - Gửi đánh giá');
  console.log('  GET  /ratings-report - Báo cáo đánh giá');
  console.log('  GET  /export-ratings-excel - Xuất Excel đánh giá');
  console.log('');
  console.log('🌐 Để truy cập từ các máy khác trong mạng LAN:');
  console.log(`   http://[IP-CỦA-MÁY-NÀY]:${PORT}`);
  console.log('   Ví dụ: http://192.168.1.100:3000');
});

// Khởi động server
app.listen(PORT, HOST, () => {
  console.log(`Server is running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  if (HOST === '0.0.0.0') {
    console.log('🌐 Server có thể truy cập từ mọi máy trong mạng LAN');
  }
  
  console.log('📋 Các endpoint có sẵn:');
  console.log('  GET  / - Trang chủ');
  console.log('  GET  /staff - Giao diện nhân viên');
  console.log('  GET  /admin-advanced - Giao diện quản trị nâng cao');
  console.log('  GET  /display - Màn hình hiển thị số thứ tự');
  console.log('  GET  /all-counters-display - Màn hình hiển thị tất cả quầy');
  console.log('  GET  /number-display - Màn hình hiển thị số hiện tại');
  console.log('  POST /call-next - Gọi số tiếp theo');
  console.log('  POST /recall - Gọi lại số hiện tại');
  console.log('  GET  /queue-status - Trạng thái hàng đợi');
  console.log('  GET  /history - Lịch sử gọi số');
  console.log('  GET  /stats - Thống kê hàng đợi');
  console.log('  GET  /latest-calls - Lệnh gọi gần nhất');
  console.log('  GET  /all-counters-status - Trạng thái tất cả quầy');
  console.log('  POST /submit-rating - Gửi đánh giá');
  console.log('  GET  /ratings-report - Báo cáo đánh giá nâng cao');
  console.log('  GET  /export-ratings-excel - Xuất Excel đánh giá chuyên nghiệp');
  console.log('');
  console.log('🌐 Để truy cập từ các máy khác trong mạng LAN:');
  console.log(`   http://[IP-CỦA-MÁY-NÀY]:${PORT}`);
  console.log('   Ví dụ: http://192.168.1.100:3000');
});