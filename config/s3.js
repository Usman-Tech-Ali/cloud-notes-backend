const AWS = require('aws-sdk');

// Configure AWS SDK
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const s3 = new AWS.S3();

const uploadToS3 = async (file, folder = 'uploads') => {
  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: `${folder}/${Date.now()}-${file.originalname}`,
    Body: file.buffer,
    ContentType: file.mimetype,
    ACL: 'public-read', // For public images, use 'private' for private files
  };

  try {
    const result = await s3.upload(params).promise();
    return {
      url: result.Location,
      key: result.Key,
    };
  } catch (error) {
    console.error('S3 Upload Error:', error);
    throw new Error('Failed to upload file to S3');
  }
};

const deleteFromS3 = async (key) => {
  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
  };

  try {
    await s3.deleteObject(params).promise();
    return true;
  } catch (error) {
    console.error('S3 Delete Error:', error);
    throw new Error('Failed to delete file from S3');
  }
};

module.exports = {
  s3,
  uploadToS3,
  deleteFromS3,
};

