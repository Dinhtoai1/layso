const axios = require('axios');

const testRating = async () => {
  try {
    const response = await axios.post('http://localhost:3000/submit-rating', {
      service: "Đất đai",
      serviceRating: 5,
      time: 4,
      attitude: 5,
      overall: 5,
      comment: "Test đánh giá",
      timestamp: new Date().toISOString()
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('Success:', response.data);
  } catch (error) {
    if (error.response) {
      console.log('Error:', error.response.status, error.response.data);
    } else {
      console.error('Network error:', error.message);
    }
  }
};

testRating();
