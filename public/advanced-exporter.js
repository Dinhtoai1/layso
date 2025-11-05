/**
 * Advanced Export Module for Professional Reports
 * Hệ thống xuất báo cáo chuyên nghiệp với nhiều định dạng
 */

class AdvancedExporter {
  constructor() {
    this.data = null;
    this.config = {
      dateFormat: 'dd/MM/yyyy',
      numberFormat: '0.00',
      encoding: 'UTF-8'
    };
  }

  // Load data from server
  async loadData(dateRange = null) {
    try {
      const response = await fetch('/ratings-report');
      const data = await response.json();
      this.data = data;
      
      if (dateRange) {
        this.data.ratings = this.filterByDateRange(data.ratings, dateRange);
      }
      
      return this.data;
    } catch (error) {
      console.error('Error loading data:', error);
      throw new Error('Không thể tải dữ liệu từ server');
    }
  }

  // Filter data by date range
  filterByDateRange(ratings, dateRange) {
    const { startDate, endDate } = dateRange;
    if (!startDate || !endDate) return ratings;
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // Include entire end date
    
    return ratings.filter(rating => {
      const ratingDate = new Date(rating.timestamp);
      return ratingDate >= start && ratingDate <= end;
    });
  }

  // Calculate comprehensive statistics
  calculateAdvancedStats(ratings) {
    if (!ratings || ratings.length === 0) {
      return {
        totalRatings: 0,
        averageRating: 0,
        satisfactionRate: 0,
        services: [],
        dailyTrends: [],
        ratingDistribution: {},
        customerCodeStats: {
          total: 0,
          withCode: 0,
          withoutCode: 0,
          percentage: 0
        }
      };
    }

    // Basic statistics
    const totalRatings = ratings.length;
    const overallRatings = ratings.filter(r => r.overall && r.overall > 0);
    const averageRating = overallRatings.length > 0 ? 
      overallRatings.reduce((sum, r) => sum + r.overall, 0) / overallRatings.length : 0;
    
    const satisfiedRatings = overallRatings.filter(r => r.overall >= 4);
    const satisfactionRate = overallRatings.length > 0 ? 
      (satisfiedRatings.length / overallRatings.length) * 100 : 0;

    // Service breakdown
    const serviceStats = {};
    ratings.forEach(rating => {
      const service = rating.service || 'Không xác định';
      if (!serviceStats[service]) {
        serviceStats[service] = {
          count: 0,
          totalRating: 0,
          ratings: []
        };
      }
      serviceStats[service].count++;
      if (rating.overall && rating.overall > 0) {
        serviceStats[service].totalRating += rating.overall;
        serviceStats[service].ratings.push(rating.overall);
      }
    });

    const services = Object.entries(serviceStats).map(([name, stats]) => ({
      name,
      count: stats.count,
      average: stats.ratings.length > 0 ? 
        stats.totalRating / stats.ratings.length : 0,
      satisfaction: stats.ratings.length > 0 ? 
        (stats.ratings.filter(r => r >= 4).length / stats.ratings.length) * 100 : 0
    }));

    // Daily trends
    const dailyData = {};
    ratings.forEach(rating => {
      const date = new Date(rating.timestamp).toISOString().split('T')[0];
      if (!dailyData[date]) {
        dailyData[date] = {
          count: 0,
          totalRating: 0,
          ratings: []
        };
      }
      dailyData[date].count++;
      if (rating.overall && rating.overall > 0) {
        dailyData[date].totalRating += rating.overall;
        dailyData[date].ratings.push(rating.overall);
      }
    });

    const dailyTrends = Object.entries(dailyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        count: data.count,
        average: data.ratings.length > 0 ? data.totalRating / data.ratings.length : 0,
        satisfaction: data.ratings.length > 0 ? 
          (data.ratings.filter(r => r >= 4).length / data.ratings.length) * 100 : 0
      }));

    // Rating distribution
    const ratingDistribution = {
      1: overallRatings.filter(r => r.overall === 1).length,
      2: overallRatings.filter(r => r.overall === 2).length,
      3: overallRatings.filter(r => r.overall === 3).length,
      4: overallRatings.filter(r => r.overall === 4).length,
      5: overallRatings.filter(r => r.overall === 5).length
    };

    // Customer code statistics (simplified without call number sync)
    const withCustomerCode = ratings.filter(r => r.customerCode && r.customerCode.trim()).length;
    const customerCodeStats = {
      total: totalRatings,
      withCode: withCustomerCode,
      withoutCode: totalRatings - withCustomerCode,
      percentage: totalRatings > 0 ? (withCustomerCode / totalRatings) * 100 : 0
    };

    return {
      totalRatings,
      averageRating,
      satisfactionRate,
      services,
      dailyTrends,
      ratingDistribution,
      customerCodeStats,
      period: {
        start: ratings.length > 0 ? new Date(Math.min(...ratings.map(r => new Date(r.timestamp)))).toLocaleDateString('vi-VN') : '',
        end: ratings.length > 0 ? new Date(Math.max(...ratings.map(r => new Date(r.timestamp)))).toLocaleDateString('vi-VN') : ''
      }
    };
  }

  // Export comprehensive report
  async exportComprehensiveReport(options = {}) {
    await this.loadData(options.dateRange);
    const stats = this.calculateAdvancedStats(this.data.ratings);
    
    // Create comprehensive Excel data
    const workbook = [];
    
    // Summary sheet
    workbook.push({
      name: 'Tổng quan',
      data: this.createSummarySheet(stats)
    });
    
    // Daily trends sheet
    workbook.push({
      name: 'Xu hướng theo ngày',
      data: this.createTrendsSheet(stats.dailyTrends)
    });
    
    // Service analysis sheet
    workbook.push({
      name: 'Phân tích dịch vụ',
      data: this.createServiceSheet(stats.services)
    });
    
    // Detailed data sheet
    if (options.includeDetails !== false) {
      workbook.push({
        name: 'Dữ liệu chi tiết',
        data: this.createDetailSheet(this.data.ratings)
      });
    }
    
    this.downloadExcel(workbook, 'Bao_cao_tong_hop_' + new Date().toISOString().split('T')[0] + '.xlsx');
  }

  // Create summary sheet
  createSummarySheet(stats) {
    const data = [];
    
    // Header
    data.push(['BÁO CÁO TỔNG HỢP HỆ THỐNG ĐÁNH GIÁ DỊCH VỤ']);
    data.push(['Thời gian xuất báo cáo:', new Date().toLocaleString('vi-VN')]);
    data.push(['Kỳ báo cáo:', `${stats.period.start} - ${stats.period.end}`]);
    data.push([]);
    
    // Key metrics
    data.push(['CHỈ SỐ QUAN TRỌNG']);
    data.push(['Tổng số đánh giá:', stats.totalRatings]);
    data.push(['Điểm trung bình:', stats.averageRating.toFixed(2)]);
    data.push(['Tỷ lệ hài lòng:', stats.satisfactionRate.toFixed(1) + '%']);
    data.push(['Số dịch vụ:', stats.services.length]);
    data.push([]);
    
    // Customer code statistics
    data.push(['THỐNG KÊ MÃ KHÁCH HÀNG']);
    data.push(['Có mã khách hàng:', stats.customerCodeStats.withCode]);
    data.push(['Không có mã:', stats.customerCodeStats.withoutCode]);
    data.push(['Tỷ lệ có mã:', stats.customerCodeStats.percentage.toFixed(1) + '%']);
    data.push([]);
    
    // Rating distribution
    data.push(['PHÂN BỐ ĐÁNH GIÁ']);
    Object.entries(stats.ratingDistribution).forEach(([rating, count]) => {
      data.push([`${rating} sao:`, count]);
    });
    
    return data;
  }

  // Create trends sheet
  createTrendsSheet(dailyTrends) {
    const data = [];
    
    // Header
    data.push(['XU HƯỚNG THEO NGÀY']);
    data.push(['Ngày', 'Số lượng', 'Điểm TB', 'Tỷ lệ hài lòng (%)']);
    
    dailyTrends.forEach(trend => {
      data.push([
        trend.date,
        trend.count,
        trend.average.toFixed(2),
        trend.satisfaction.toFixed(1)
      ]);
    });
    
    return data;
  }

  // Create service analysis sheet
  createServiceSheet(services) {
    const data = [];
    
    // Header
    data.push(['PHÂN TÍCH THEO DỊCH VỤ']);
    data.push(['Dịch vụ', 'Số lượng', 'Điểm TB', 'Tỷ lệ hài lòng (%)']);
    
    services
      .sort((a, b) => b.count - a.count)
      .forEach(service => {
        data.push([
          service.name,
          service.count,
          service.average.toFixed(2),
          service.satisfaction.toFixed(1)
        ]);
      });
    
    return data;
  }

  // Create detail sheet
  createDetailSheet(ratings) {
    const data = [];
    
    // Header
    data.push(['DỮ LIỆU CHI TIẾT']);
    data.push([
      'Thời gian',
      'Mã khách hàng', 
      'Dịch vụ',
      'Điểm tổng thể',
      'Ý kiến'
    ]);
    
    ratings
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .forEach(rating => {
        data.push([
          new Date(rating.timestamp).toLocaleString('vi-VN'),
          rating.customerCode || '',
          rating.service || '',
          rating.overall || '',
          rating.comment || ''
        ]);
      });
    
    return data;
  }

  // Download Excel file
  downloadExcel(workbook, filename) {
    // Create CSV content for each sheet
    let csvContent = '\uFEFF'; // BOM for UTF-8
    
    workbook.forEach((sheet, index) => {
      if (index > 0) csvContent += '\n\n=== ' + sheet.name + ' ===\n\n';
      
      sheet.data.forEach(row => {
        const csvRow = row.map(cell => {
          const cellStr = String(cell || '');
          // Escape quotes and wrap in quotes if contains comma, quote, or newline
          if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
            return '"' + cellStr.replace(/"/g, '""') + '"';
          }
          return cellStr;
        }).join(',');
        csvContent += csvRow + '\n';
      });
    });
    
    // Create download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename.replace('.xlsx', '.csv'));
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }

  // Executive summary export
  async exportExecutiveReport(options = {}) {
    await this.loadData(options.dateRange);
    const stats = this.calculateAdvancedStats(this.data.ratings);
    
    const data = [];
    
    // Executive summary header
    data.push(['BÁO CÁO ĐIỀU HÀNH - HỆ THỐNG ĐÁNH GIÁ DỊCH VỤ']);
    data.push(['Thời gian:', new Date().toLocaleString('vi-VN')]);
    data.push(['Kỳ báo cáo:', `${stats.period.start} - ${stats.period.end}`]);
    data.push([]);
    
    // KPI Dashboard
    data.push(['BẢNG ĐIỀU KHIỂN KPI']);
    data.push(['Chỉ số', 'Giá trị', 'Trạng thái']);
    data.push(['Tổng đánh giá', stats.totalRatings, stats.totalRatings > 100 ? '✅ Tốt' : '⚠️ Cần cải thiện']);
    data.push(['Điểm trung bình', stats.averageRating.toFixed(2), stats.averageRating >= 4 ? '✅ Tốt' : '⚠️ Cần cải thiện']);
    data.push(['Tỷ lệ hài lòng', stats.satisfactionRate.toFixed(1) + '%', stats.satisfactionRate >= 80 ? '✅ Tốt' : '⚠️ Cần cải thiện']);
    data.push([]);
    
    // Top services
    data.push(['TOP 5 DỊCH VỤ']);
    data.push(['Dịch vụ', 'Số lượng', 'Điểm TB']);
    stats.services
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .forEach(service => {
        data.push([service.name, service.count, service.average.toFixed(2)]);
      });
    
    this.downloadExcel([{ name: 'Báo cáo điều hành', data }], 'Bao_cao_dieu_hanh_' + new Date().toISOString().split('T')[0] + '.csv');
  }

  // Analytical report export
  async exportAnalyticalReport(options = {}) {
    await this.loadData(options.dateRange);
    const stats = this.calculateAdvancedStats(this.data.ratings);
    
    // Create analytical workbook
    const workbook = [
      {
        name: 'Phân tích thống kê',
        data: this.createStatisticalAnalysis(stats)
      },
      {
        name: 'Tương quan dữ liệu',
        data: this.createCorrelationAnalysis(this.data.ratings)
      },
      {
        name: 'Đề xuất cải thiện',
        data: this.createRecommendations(stats)
      }
    ];
    
    this.downloadExcel(workbook, 'Bao_cao_phan_tich_' + new Date().toISOString().split('T')[0] + '.xlsx');
  }

  // Create statistical analysis
  createStatisticalAnalysis(stats) {
    const data = [];
    
    data.push(['PHÂN TÍCH THỐNG KÊ NÂNG CAO']);
    data.push([]);
    
    // Descriptive statistics
    data.push(['THỐNG KÊ MÔ TẢ']);
    data.push(['Trung bình:', stats.averageRating.toFixed(3)]);
    
    // Add more statistical measures here
    data.push(['Độ lệch chuẩn:', 'Đang tính toán...']);
    data.push(['Trung vị:', 'Đang tính toán...']);
    data.push(['Mode:', 'Đang tính toán...']);
    
    return data;
  }

  // Create correlation analysis
  createCorrelationAnalysis(ratings) {
    const data = [];
    
    data.push(['PHÂN TÍCH TƯƠNG QUAN']);
    data.push([]);
    data.push(['Phân tích mối quan hệ giữa các yếu tố đánh giá']);
    data.push(['Sẽ được bổ sung trong phiên bản tiếp theo']);
    
    return data;
  }

  // Create recommendations
  createRecommendations(stats) {
    const data = [];
    
    data.push(['ĐỀ XUẤT CẢI THIỆN']);
    data.push([]);
    
    // Automated recommendations based on data
    if (stats.satisfactionRate < 80) {
      data.push(['🔴 ƯU TIÊN CAO: Tỷ lệ hài lòng thấp (' + stats.satisfactionRate.toFixed(1) + '%)']);
      data.push(['- Cần cải thiện chất lượng dịch vụ']);
      data.push(['- Đào tạo lại nhân viên']);
      data.push(['- Khảo sát nguyên nhân không hài lòng']);
    }
    
    if (stats.averageRating < 4) {
      data.push(['🔶 ƯU TIÊN TRUNG BÌNH: Điểm đánh giá thấp (' + stats.averageRating.toFixed(2) + ')']);
      data.push(['- Cải thiện quy trình phục vụ']);
      data.push(['- Nâng cao kỹ năng giao tiếp']);
    }
    
    // Service-specific recommendations
    data.push([]);
    data.push(['KHUYẾN NGHỊ THEO DỊCH VỤ:']);
    stats.services.forEach(service => {
      if (service.satisfaction < 70) {
        data.push([`- ${service.name}: Cần cải thiện (${service.satisfaction.toFixed(1)}% hài lòng)`]);
      }
    });
    
    return data;
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AdvancedExporter;
} else {
  window.AdvancedExporter = AdvancedExporter;
}
