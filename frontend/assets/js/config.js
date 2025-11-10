// AWS Configuration
const AWS_CONFIG = {
  region: 'us-east-1',
  apiEndpoint: 'https://rsqbj2qxlj.execute-api.us-east-1.amazonaws.com',
  cognito: {
    userPoolId: 'us-east-1_H7CkhbKyO',
    userPoolClientId: '1rp3q7m9nuvebskg2d6f997rei'
  },
  dynamoDBTable: 'pricepulse-dev-items',
  snsTopicArn: 'arn:aws:sns:us-east-1:211125457564:pricepulse-dev-alerts'
};

// Demo mode (localStorage kullanır) ya da Live mode (AWS kullanır)
// Live mode'a geçmek için false yapın ve Cognito kullanıcısı oluşturun
const USE_DEMO_MODE = false;

export { AWS_CONFIG, USE_DEMO_MODE };
